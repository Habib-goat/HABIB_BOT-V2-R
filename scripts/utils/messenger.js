const config = require('../../config.json');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const database = require('./database');
const botEngine = require('../middleware/botEngine');
const commandLoader = require('../handlers/commandLoader');
const eventLoader = require('../handlers/eventLoader');
const { MessengerAdapterFactory } = require('./messengerAdapter');

let loginLib;
try {
  const libName = config.messengerLib || 'fca-unofficial';
  loginLib = require(libName);
} catch (err) {
  logger.warn(`[Messenger] Selected library "${config.messengerLib || 'fca-unofficial'}" not found, falling back to "fca-unofficial"`);
  try {
    loginLib = require('fca-unofficial');
  } catch (e) {
    logger.error("[Messenger] Failed to load 'fca-unofficial'. Running in simulated dashboard mode only.");
  }
}

let isConnected = false;
let stopListener = null;
let reconnectTimer = null;

// Ensure non-blocking fetching of metadata
function ensureUserData(api, senderID) {
  if (!senderID) return;
  const user = database.getUser(senderID);
  if (user.name.startsWith("User ") && typeof api.getUserInfo === 'function') {
    api.getUserInfo(senderID, (err, info) => {
      if (!err && info && info[senderID]) {
        const realName = info[senderID].name;
        if (realName) {
          database.updateUser(senderID, { name: realName });
          logger.info(`[Database] Automatically resolved and updated name for user ${senderID}: "${realName}"`);
        }
      }
    });
  }
}

function ensureThreadData(api, threadID) {
  if (!threadID) return;
  const thread = database.getThread(threadID);
  if (thread.name.startsWith("Group Thread ") && typeof api.getThreadInfo === 'function') {
    api.getThreadInfo(threadID, (err, info) => {
      if (!err && info) {
        const realName = info.threadName || info.name;
        if (realName) {
          database.updateThread(threadID, { name: realName });
          logger.info(`[Database] Automatically resolved and updated name for thread ${threadID}: "${realName}"`);
        }
      }
    });
  }
}

// System events dispatcher
async function dispatchSystemEvent(api, event) {
  const { logMessageType, threadID } = event;
  if (!logMessageType) return;

  logger.info(`[System Event] Received system event: '${logMessageType}' in thread ${threadID}`);

  for (const [name, eventModule] of eventLoader.events.entries()) {
    if (eventModule.config && Array.isArray(eventModule.config.eventType)) {
      if (eventModule.config.eventType.includes(logMessageType)) {
        if (typeof eventModule.onStart === 'function') {
          try {
            logger.info(`[Event Handler] Running event handler '${name}' for system event type '${logMessageType}'`);
            await eventModule.onStart({
              api,
              event,
              usersData: database,
              threadsData: database
            });
          } catch (err) {
            logger.error(`Error executing event handler '${name}':`, err);
          }
        }
      }
    }
  }
}

// Adapter delegation is handled via MessengerAdapterFactory

function startMessenger(app, wsServer) {
  logger.system("Initializing Facebook Messenger client service...");

  const appStatePath = path.join(__dirname, '../../appstate.json');
  if (!fs.existsSync(appStatePath)) {
    logger.error("❌ appstate.json file not found! Unable to start Messenger Bot runtime.");
    logger.warn("Continuing system startup in simulated/interactive console mode.");
    return;
  }

  let appState;
  try {
    appState = fs.readJsonSync(appStatePath);
    if (!Array.isArray(appState) || appState.length === 0) {
      throw new Error("appstate.json is empty or not a valid JSON array.");
    }
  } catch (err) {
    logger.error("❌ Failed to parse appstate.json. Skipping Messenger Bot runtime.", err);
    logger.warn("Continuing system startup in simulated/interactive console mode.");
    return;
  }

  function doConnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    logger.info("Attempting login to Facebook Messenger via credentials session...");

    if (!loginLib) {
      logger.error("❌ No Messenger login library available. Unable to connect to live Messenger API.");
      return;
    }

    loginLib({ appState }, (err, api) => {
      if (err) {
        logger.error("❌ Facebook Messenger authentication failed:", err.error || err.message || err);
        logger.warn("Continuing system startup in simulated/interactive console mode. Auto-reconnection loop active.");
        
        // Retry connection in 30 seconds
        reconnectTimer = setTimeout(doConnect, 30000);
        return;
      }

      logger.success("✅ Connected successfully to Facebook Messenger API!");
      isConnected = true;

      // Set options
      api.setOptions({
        listenEvents: true,
        selfListen: false,
        forceLogin: true,
        autoMarkRead: true
      });

      // Wrap standard API with our custom promise-based adapter
      const adaptedApi = MessengerAdapterFactory.create(config.messengerLib || 'fca-unofficial', api, wsServer);

      // Make API accessible globally or in express app
      app.set('messengerApi', adaptedApi);

      // Listen to incoming messages and events
      logger.info("Messenger live message broker successfully engaged. Listening for events...");

      stopListener = api.listenMqtt(async (listenErr, event) => {
        if (listenErr) {
          logger.error("Broker connection encountered error:", listenErr);
          isConnected = false;
          
          if (typeof stopListener === 'function') {
            try { stopListener(); } catch(e) {}
          }
          
          logger.warn("Broker disconnected. Scheduling reconnection in 10 seconds...");
          reconnectTimer = setTimeout(doConnect, 10000);
          return;
        }

        // Safe type casts and string formats
        event.senderID = event.senderID ? String(event.senderID) : "";
        event.threadID = event.threadID ? String(event.threadID) : "";
        event.messageID = event.messageID ? String(event.messageID) : "";

        // Background resolve of display names
        ensureUserData(adaptedApi, event.senderID);
        ensureThreadData(adaptedApi, event.threadID);

        // Process based on type
        try {
          if (event.type === "message" || event.type === "message_reply") {
            // Process message and run command matches
            await botEngine.processMessage(event, commandLoader, eventLoader, wsServer, null, adaptedApi);
          } else if (event.type === "message_reaction") {
            // Normalize as reaction event for botEngine
            const reactionEvent = {
              ...event,
              reaction: event.reaction,
              messageID: event.messageID,
              senderID: event.senderID,
              threadID: event.threadID
            };
            await botEngine.processMessage(reactionEvent, commandLoader, eventLoader, wsServer, null, adaptedApi);
          } else if (event.type === "event") {
            // System event (subscribe, unsubscribe, group properties, etc.)
            await dispatchSystemEvent(adaptedApi, event);
          }
        } catch (procErr) {
          logger.error("Error processing incoming Messenger broker event:", procErr);
        }
      });
    });
  }

  doConnect();
}

module.exports = {
  startMessenger,
  isConnected: () => isConnected
};
