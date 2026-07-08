/**
 * Riyad Bot Framework - Reaction Manager
 */

const logger = require('../utils/logger');
const path = require('path');

let config = {};
try {
  config = global.config || require(path.join(process.cwd(), 'config.json'));
} catch {
  config = {};
}

if (!global.RiyadBot) global.RiyadBot = {};
if (!global.RiyadBot.onReaction) global.RiyadBot.onReaction = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of global.RiyadBot.onReaction) {
    if (now - (data.timestamp || 0) > 30 * 60 * 1000) {
      global.RiyadBot.onReaction.delete(id);
    }
  }
}, 10 * 60 * 1000);

async function unsend(api, messageID) {
  return new Promise((resolve, reject) => {
    try {
      if (api.unsendMessage.length >= 2) {
        api.unsendMessage(messageID, err => err ? reject(err) : resolve());
      } else {
        Promise.resolve(api.unsendMessage(messageID)).then(resolve).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  register(messageID, data) {
    global.RiyadBot.onReaction.set(messageID, { ...data, timestamp: Date.now() });
  },

  get(messageID) {
    return global.RiyadBot.onReaction.get(messageID);
  },

  delete(messageID) {
    global.RiyadBot.onReaction.delete(messageID);
  },

  async handle(api, event, commandLoader) {
    const { messageID, reaction, userID, senderID } = event;
    if (!messageID) return false;

    if (reaction === "🤬") {
      const reactor = String(userID || senderID || "");
      const admins = [...(config.adminIDs || []), ...(config.ownerIDs || [])].map(String);
      const botID = typeof api.getCurrentUserID === "function"
        ? api.getCurrentUserID()
        : (api.userID || api.getCurrentUserID);

      if (admins.includes(reactor) && botID && String(event.senderID) === String(botID)) {
        try {
          await unsend(api, messageID);
          return true;
        } catch (e) {
          logger.error("Auto unsend failed:", e);
        }
      }
    }

    const data = global.RiyadBot.onReaction.get(messageID);
    if (!data) return false;

    const cmd = commandLoader.commands.get(data.commandName);
    if (!cmd || typeof cmd.onReaction !== "function") return false;

    try {
      await cmd.onReaction({
        api,
        event,
        reactionData: data,
        reactionManager: module.exports,
        message: api
      });
      return true;
    } catch (err) {
      logger.error(`Error in onReaction '${data.commandName}':`, err);
      return false;
    }
  }
};
