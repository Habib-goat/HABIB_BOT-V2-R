/**
 * Riyad Bot Framework - Reply Manager
 * Standard management for onReply hooks.
 */

const logger = require("../utils/logger");
const database = require("../utils/database");
const reactionManager = require("../reactions/reactionManager");

// Initialize global reply register
if (!global.RiyadBot) {
  global.RiyadBot = {};
}
if (!global.RiyadBot.onReply) {
  global.RiyadBot.onReply = new Map(); // key: messageID, value: { commandName, authorID, ... }
}

const replyManager = {
  set: (messageID, replyData) => {
    return replyManager.register(messageID, replyData);
  },
delete: (messageID) => {
  return global.RiyadBot.onReply.delete(messageID);
},
  register: (messageID, replyData) => {
    global.RiyadBot.onReply.set(messageID, {
      ...replyData,
      timestamp: Date.now()
    });
    logger.info(`[Reply Manager] Registered reply listener for message ${messageID} (${replyData.commandName})`);
  },
  /**
   * Check if a message reply event has an active listener and execute it
   */
  handle: async (api, event, commandLoader) => {
    const { messageReply, threadID, senderID } = event;
    if (!messageReply) return false;

    const targetMessageID = messageReply.messageID;
    if (global.RiyadBot.onReply.has(targetMessageID)) {
      const replyData = global.RiyadBot.onReply.get(targetMessageID);
      
      const cmd = commandLoader.commands.get(replyData.commandName);
      if (cmd && typeof cmd.onReply === 'function') {
        try {
          logger.info(`[Reply Manager] Executing onReply for command '${replyData.commandName}'`);

await cmd.onReply({
  api,
  event,

  Reply: {
    ...replyData,
    messageID: targetMessageID
  },

  replyData,

  args: event.body ? event.body.trim().split(/\s+/).slice(1) : [],

  message: api,

  usersData: database,
  threadsData: database,

  replyManager: module.exports,
  reactionManager
});
          return true;
        } catch (err) {
          logger.error(`Error in onReply handler of command '${replyData.commandName}':`, err);
        }
      }
    }
    return false;
  },

  /**
   * Clean up expired replies listeners (older than 10 mins)
   */
  cleanExpired: () => {
    const now = Date.now();
    const expiryLimit = 10 * 60 * 1000; // 10 minutes
    let count = 0;
    
    for (const [key, val] of global.RiyadBot.onReply.entries()) {
      if (now - val.timestamp > expiryLimit) {
        global.RiyadBot.onReply.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.info(`[Reply Manager] Pruned ${count} expired reply listeners.`);
    }
  }
};

module.exports = replyManager;
