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
  const libName = config.messengerLib || "fca-eryxenx";
  loginLib = require(libName);
} catch (err) {
  logger.warn(
    `[Messenger] Selected library "${config.messengerLib || "fca-eryxenx"}" not found, falling back to "fca-eryxenx"`
  );

  try {
    loginLib = require("fca-eryxenx");
  } catch (e) {
    logger.error(
      "[Messenger] Failed to load 'fca-eryxenx'. Running in simulated dashboard mode only."
    );
  }
}

let isConnected = false;
let stopListener = null;
let reconnectTimer = null;
// Ensure non-blocking fetching of user metadata
function ensureUserData(api, senderID) {
  if (!senderID) return;

  const user = database.getUser(senderID);

  if (
    user.name.startsWith("User ") &&
    typeof api.getUserInfo === "function"
  ) {
    api.getUserInfo(senderID, (err, info) => {
      if (err || !info || !info[senderID]) return;

      const realName =
        info[senderID].name ||
        info[senderID].fullName;

      if (!realName) return;

      database.updateUser(senderID, {
        name: realName
      });

      logger.info(
        `[Database] Synced user "${realName}" (${senderID})`
      );
    });
  }
}
// Ensure non-blocking fetching of metadata
function ensureThreadData(api, threadID) {
  if (!threadID) return;

  if (typeof api.getThreadInfo !== "function") return;

  api.getThreadInfo(threadID, (err, info) => {
    if (err || !info) return;

    const members = [];

    // Build name map
    const nameMap = {};

    if (Array.isArray(info.userInfo)) {
      for (const user of info.userInfo) {
        nameMap[String(user.id)] =
          user.name || user.fullName || "Member";
      }
    }

    if (Array.isArray(info.userInfos)) {
      for (const user of info.userInfos) {
        nameMap[String(user.id)] =
          user.name || user.fullName || "Member";
      }
    }

    if (Array.isArray(info.participantIDs)) {
      for (const uid of info.participantIDs) {
        members.push({
  userID: String(uid),
  name: nameMap[String(uid)] || `User ${String(uid).slice(-4)}`,
  inGroup: true,
  isAdmin: (info.adminIDs || []).some(
    x => String(x.id || x) === String(uid)
  )
});
      }
    }

    database.updateThread(threadID, {
  id: String(threadID),
  name: info.threadName || info.name || "Unknown Group",
  adminIDs: (info.adminIDs || []).map(x => String(x.id || x)),
  approvalMode: Boolean(info.approvalMode),
  members,
  lastSync: Date.now()
});

    logger.info(
      `[Database] Synced "${info.threadName || info.name}" (${members.length} members)`
    );
  });
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
      console.log("editMessage:", typeof api.editMessage);

      logger.success("✅ Connected successfully to Facebook Messenger API!");
      isConnected = true;
console.log("unsendMessage:", typeof api.unsendMessage);
console.log("markAsRead:", typeof api.markAsRead);
console.log("markAsSeen:", typeof api.markAsSeen);
console.log("removeUserFromGroup:", typeof api.removeUserFromGroup);
      // Set options
      api.setOptions({
        listenEvents: true,
        selfListen: false,
        forceLogin: true,
        autoMarkRead: true
      });

      // Wrap standard API with our custom promise-based adapter
      const adaptedApi = MessengerAdapterFactory.create(
  config.messengerLib || "fca-eryxenx",
  api,
  wsServer
);
const autoTimerService = require("../services/autotimerService");
autoTimerService.setApi(adaptedApi);
      // Make API accessible globally or in express app
      app.set('messengerApi', adaptedApi);

      // Listen to incoming messages and events
      logger.info("Messenger live message broker successfully engaged. Listening for events...");
console.log("LISTENER STARTED");
      stopListener = api.listenMqtt(async (listenErr, event) => {
        console.log("[LISTENER]", event.type, event.messageID);
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

if (
  event.type === "message" ||
  event.type === "message_reply"
) {
  ensureThreadData(adaptedApi, event.threadID);
}

if (
  event.type === "event" &&
  [
    "log:subscribe",
    "log:unsubscribe",
    "log:thread-name",
    "log:thread-admins",
    "log:thread-approval-mode"
  ].includes(event.logMessageType)
) {
  ensureThreadData(adaptedApi, event.threadID);
}
        // Process based on type
try {

  if (event.type === "message" || event.type === "message_reply") {

    await botEngine.processMessage(
      event,
      commandLoader,
      eventLoader,
      wsServer,
      null,
      adaptedApi
    );

  } else if (event.type === "message_reaction") {

    console.log("========== REACTION EVENT ==========");
    console.log(JSON.stringify(event, null, 2));
    console.log("====================================");

    await botEngine.processMessage(
      {
        ...event,
        reaction: event.reaction
      },
      commandLoader,
      eventLoader,
      wsServer,
      null,
      adaptedApi
    );

} else if (event.type === "event") {

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
