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
  const libName = config.messengerLib || "fca-riyad";
  loginLib = require(libName);

  try {
    const fs2 = require("fs");
    const path2 = require("path");
    const pkgMain = require.resolve(libName);
    const loginHelperPath = path2.join(path2.dirname(pkgMain), "module", "loginHelper.js");
    const c2 = fs2.readFileSync(loginHelperPath, "utf8");
    const lines = c2.split("\n");
    const target = lines.findIndex((l) => l.includes("e2eeModule = require"));
    console.log("[DEBUG] loginHelper.js path:", loginHelperPath);
    console.log("[DEBUG] e2ee require line (" + (target + 1) + "):", lines[target]);
    console.log("[DEBUG] nativeBridge.js exists:", fs2.existsSync(path2.join(path2.dirname(pkgMain), "src/api/socket/e2ee/nativeBridge.js")));
    console.log("[DEBUG] messagix.so exists:", fs2.existsSync(path2.join(path2.dirname(pkgMain), "src/api/socket/e2ee/native/build/messagix.so")));
  } catch (dbgErr) {
    console.log("[DEBUG] failed to inspect loginHelper.js:", dbgErr.message);
  }
} catch (err) {
  logger.warn(
    `[Messenger] Selected library "${config.messengerLib || "fca-riyad"}" not found, falling back to "fca-riyad"`
  );

  try {
    loginLib = require("fca-riyad");
  } catch (e) {
    logger.error(
      "[Messenger] Failed to load 'fca-riyad'. Running in simulated dashboard mode only."
    );
  }
}

let isConnected = false;
let stopListener = null;
let reconnectTimer = null;
let doConnectRef = null;
let currentAdaptedApi = null;

// ── Duplicate-event guard ───────────────────────────────────────────────────
// fca-eryxenx's MQTT stream occasionally redelivers the exact same message
// event (e.g. right after a reconnect, or when Facebook resends on the
// socket). Without this guard, the same incoming command message gets
// processed twice, which is why users would see every command's reply sent
// twice. We remember recently-seen messageIDs for a short window and skip
// anything we've already handled.
const recentlyProcessedMessageIds = new Map(); // messageID -> timestamp
const DEDUPE_WINDOW_MS = 60 * 1000;

function isDuplicateEvent(messageID) {
  if (!messageID) return false;

  const now = Date.now();

  // Opportunistic cleanup so this map never grows unbounded.
  if (recentlyProcessedMessageIds.size > 1000) {
    for (const [id, ts] of recentlyProcessedMessageIds) {
      if (now - ts > DEDUPE_WINDOW_MS) recentlyProcessedMessageIds.delete(id);
    }
  }

  if (recentlyProcessedMessageIds.has(messageID)) {
    return true;
  }

  recentlyProcessedMessageIds.set(messageID, now);
  return false;
}

function stopCurrentListener() {
  if (!stopListener) return;
  try {
    if (typeof stopListener === "function") {
      stopListener();
    } else if (typeof stopListener.stopListening === "function") {
      stopListener.stopListening();
    }
  } catch (_) {}
}
// Ensure non-blocking fetching of user metadata
async function ensureUserData(api, senderID) {
  if (!senderID) return;

  const user = await database.getUser(senderID);

  if (
    user.name.startsWith("User ") &&
    typeof api.getUserInfo === "function"
  ) {
    api.getUserInfo(senderID, async (err, info) => {
      if (err || !info || !info[senderID]) return;

      const realName =
        info[senderID].name ||
        info[senderID].fullName;

      if (!realName) return;

      await database.updateUser(senderID, {
  name: realName
});

      logger.info(
        `[Database] Synced user "${realName}" (${senderID})`
      );
    });
  }
}
// Ensure non-blocking fetching of metadata
async function ensureThreadData(api, threadID) {
  if (!threadID) return;

  if (typeof api.getThreadInfo !== "function") return;

  api.getThreadInfo(threadID, async (err, info) => {
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

    await database.updateThread(threadID, {
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
  const { logMessageType } = event;

  logger.info(`[DEBUG] System Event: ${logMessageType}`);

  for (const [name, eventModule] of eventLoader.events.entries()) {
    if (!eventModule.config?.eventType?.includes(logMessageType))
      continue;

    logger.info(`[DEBUG] Running: ${name}`);

    try {
      await eventModule.onStart({
        api,
        event,
        usersData: database,
        threadsData: database
      });

      logger.info(`[DEBUG] Finished: ${name}`);
    } catch (err) {
      logger.error(`[DEBUG] ${name} ERROR:`, err);
    }
  }

  // ✅ Run command onEvent handlers
  for (const command of commandLoader.commands.values()) {
    if (typeof command.onEvent === "function") {
      try {
        await command.onEvent({
          api,
          event,
          usersData: database,
          threadsData: database
        });
      } catch (err) {
        logger.error(
          `Command '${command.config?.name}' onEvent failed:`,
          err
        );
      }
    }
  }
} // ← Function এখানেই শেষ হবে
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
    return;
  }

  console.log("========== RAW API ==========");
  console.log("addUserToGroup:", typeof api.addUserToGroup);
  console.log("removeUserFromGroup:", typeof api.removeUserFromGroup);
  console.log("getThreadInfo:", typeof api.getThreadInfo);
  console.log("API Keys:", Object.keys(api));
  console.log("=============================");

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
      const adaptedApi = MessengerAdapterFactory.create(
  config.messengerLib || "fca-riyad",
  api,
  wsServer
);
      currentAdaptedApi = adaptedApi;
      
console.log("RAW addUserToGroup =", typeof api.addUserToGroup);
console.log("ADAPTER addUserToGroup =", typeof adaptedApi.addUserToGroup);
      
console.log("=== ADAPTER DEBUG ===");
console.log("RAW sendMessage =", typeof api.sendMessage);
console.log("RAW sendMessageDM =", typeof api.sendMessageDM);

console.log("sendMessageDM source:");
console.log(api.sendMessageDM.toString());

console.log("ADAPTER sendMessage =", typeof adaptedApi.sendMessage);
console.log("ADAPTER sendMessageDM =", typeof adaptedApi.sendMessageDM);
console.log("=====================");

const autoTimerService = require("../services/autotimerService");
autoTimerService.setApi(adaptedApi);
      // Make API accessible globally or in express app
      app.set('messengerApi', adaptedApi);

      // ─── E2EE (Signal/Noise) bridge ────────────────────────────────────
      // fca-riyad already auto-connects E2EE itself right after login
      // (module/loginHelper.js calls api.connectE2EE() internally, fire-
      // and-forget). Its internal guard makes a second api.connectE2EE()
      // call (with NO arguments) simply return/await that SAME in-flight
      // promise — so we just await it here instead of racing it or passing
      // a callback where the real signature expects a deviceStorePath
      // string. Only once it resolves do we switch to listenE2EE(), since
      // listenE2EE() checks e2ee.isConnected() a single time when called —
      // calling it too early permanently misses the encrypted stream.
      const e2eeEnabled = !!(config.e2ee && config.e2ee.enable);

      const handleEvent = async (listenErr, event) => {
  if (listenErr) {
    logger.error("Broker connection encountered error:", listenErr);
    isConnected = false;

    stopCurrentListener();

    reconnectTimer = setTimeout(doConnect, 10000);
    return;
  }

  if (!event) return;

  event.senderID = String(event.senderID || "");
  event.threadID = String(event.threadID || "");
  event.messageID = String(event.messageID || "");

  // Drop redelivered duplicates of the same message/reply event so commands
  // (and their replies) don't run/send twice.
  if (
    (event.type === "message" || event.type === "message_reply") &&
    isDuplicateEvent(event.messageID)
  ) {
    logger.warn(`[Dedupe] Skipped duplicate message event: ${event.messageID}`);
    return;
  }

  console.log("================");
console.log(JSON.stringify(event, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
console.log("================");

console.log("EVENT TYPE:", event.type);
console.log("LOG TYPE:", event.logMessageType);
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

    if (event.isE2EE && event.threadID && typeof adaptedApi.markE2EEThread === 'function') {
      adaptedApi.markE2EEThread(event.threadID);
    }
if (event.isE2EE && event.messageID && event.threadID && typeof adaptedApi.markE2EEMessage === 'function') {
      adaptedApi.markE2EEMessage(event.messageID, event.threadID, event.e2ee && event.e2ee.senderJid);
    }
    await botEngine.processMessage(
      event,
      commandLoader,
      eventLoader,
      wsServer,
      null,
      adaptedApi
    );

  } else if (event.type === "message_reaction") {

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

  // NOTE: previously this also called dispatchSystemEvent(adaptedApi, event)
  // right before botEngine.processMessage(). Both functions independently
  // loop over eventLoader.events and call each handler's onStart() for the
  // same logMessageType — so every "event" (member join/leave, thread name
  // change, admin change, etc.) was running twice: welcome/memberWelcome
  // cards sent twice, groupnoti sent twice, goodbye/antileave sent twice.
  // botEngine.processMessage's log-event branch already covers everything
  // dispatchSystemEvent did (plus replyManager/reactionManager context and
  // wildcard "*" event types), so we only call it once here.
  await botEngine.processMessage(
    event,
    commandLoader,
    eventLoader,
    wsServer,
    null,
    adaptedApi
  );

}

} catch (procErr) {
  logger.error("Error processing incoming Messenger broker event:", procErr);
}
      };

      (async function beginListening() {
        if (e2eeEnabled && typeof api.connectE2EE === "function") {
          try {
            logger.info("Waiting for E2EE (Signal/Noise) bridge...");
            await api.connectE2EE();
            logger.success("🔒 E2EE bridge ready — encrypted messaging active.");
          } catch (e2eeErr) {
            logger.warn(
              "E2EE bridge unavailable, continuing with MQTT only:",
              e2eeErr && e2eeErr.message ? e2eeErr.message : e2eeErr
            );
            // TEMP DEBUG: full stack so we can pinpoint exactly which line
            // inside fca-riyad's vendor E2EE bundle is throwing. Remove this
            // console.error once the root cause is found and fixed.
            console.error("[E2EE DEBUG] full stack:", e2eeErr && e2eeErr.stack ? e2eeErr.stack : e2eeErr);
          }
        } else if (e2eeEnabled) {
          logger.warn("api.connectE2EE not available in this fca-riyad build — E2EE disabled for this session.");
        }

        logger.info("Messenger live message broker successfully engaged. Listening for events...");
        const listenFn = (e2eeEnabled && typeof api.listenE2EE === "function")
          ? api.listenE2EE
          : api.listenMqtt;
        stopListener = listenFn(handleEvent);
      })();
    });
  }

  doConnectRef = doConnect;
  doConnect();
}

function reconnectMessenger() {
  logger.system("Hot-restart requested: tearing down current session and reconnecting...");
  stopCurrentListener();
  isConnected = false;
  if (typeof doConnectRef === "function") {
    doConnectRef();
  } else {
    logger.error("Cannot hot-restart: messenger was never started.");
  }
}

module.exports = {
  startMessenger,
  isConnected: () => isConnected,
  reconnectMessenger,
  getApi: () => currentAdaptedApi
};
