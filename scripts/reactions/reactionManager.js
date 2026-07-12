/**
 * Riyad Bot Framework - Reaction Manager
 */

const logger = require("../utils/logger");
const path = require("path");

const database = require("../utils/database");
const replyManager = require("../replies/replyManager");
let config = {};
try {
  config = global.config || require(path.join(process.cwd(), "config.json"));
} catch {
  config = {};
}

const reactions = new Map();

// Auto cleanup (30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of reactions) {
    if (now - data.timestamp > 30 * 60 * 1000) {
      reactions.delete(id);
    }
  }
}, 10 * 60 * 1000);

module.exports = {
  register(messageID, data) {
  console.log("[REGISTER]", messageID, data);

  reactions.set(String(messageID), {
    ...data,
    timestamp: Date.now()
  });
},

  set(messageID, data) {
    this.register(messageID, data);
  },

  get(messageID) {
    return reactions.get(String(messageID));
  },

  delete(messageID) {
    reactions.delete(String(messageID));
  },
cleanExpired() {
  const now = Date.now();

  for (const [id, data] of reactions) {
    if (now - data.timestamp > 30 * 60 * 1000) {
      reactions.delete(id);
    }
  }
},
  async handle(api, event, commandLoader) {
    const { messageID, reaction } = event;

    if (!messageID) return false;

    const reactionData = reactions.get(String(messageID));

console.log("[REACTION]", messageID);
console.log("[FOUND]", reactionData);

// 🤬 / 😡 = Admin/Owner Only Unsend
if ((reaction === "🤬" || reaction === "😡") && reactionData) {
  const reactor = String(event.userID || event.senderID || "");

  const admins = [
    ...(config.adminIDs || []),
    ...(config.ownerIDs || [])
  ].map(String);

  if (!admins.includes(reactor)) {
    return false;
  }

  try {
    await api.unsendMessage(messageID);
    reactions.delete(String(messageID));
    return true;
  } catch (err) {
    logger.error("Reaction unsend failed:", err);
    return false;
  }
}

    if (!reactionData) return false;

    const cmd = commandLoader.commands.get(reactionData.commandName);

    if (!cmd || typeof cmd.onReaction !== "function")
      return false;

    try {
await cmd.onReaction({
  api,
  event,

  Reaction: reactionData,
  reactionData,

  args: event.body ? event.body.trim().split(/\s+/).slice(1) : [],

  message: api,

  usersData: database,
  threadsData: database,

  replyManager,
  reactionManager: module.exports
});

      return true;
    } catch (err) {
      logger.error(
        `Error in onReaction '${reactionData.commandName}':`,
        err
      );
      return false;
    }
  }
};
