/**
 * Riyad Bot Framework - Reaction Manager
 * Standard management for onReaction hooks.
 */

const logger = require('../utils/logger');

// Initialize global reaction register
if (!global.RiyadBot) {
  global.RiyadBot = {};
}
if (!global.RiyadBot.onReaction) {
  global.RiyadBot.onReaction = new Map(); // key: messageID, value: { commandName, authorID, ... }
}

const reactionManager = {
  /**
   * Register a message ID to listen for reactions
   * @param {string} messageID - The ID of the message
   * @param {object} reactionData - Metadata (commandName, senderID, etc.)
   */
  register: (messageID, reactionData) => {
    global.RiyadBot.onReaction.set(messageID, {
      ...reactionData,
      timestamp: Date.now()
    });
    logger.info(`[Reaction Manager] Registered reaction listener for message ${messageID} (${reactionData.commandName})`);
  },

  /**
   * Check if a message reaction event has an active listener and execute it
   */
  handle: async (api, event, commandLoader) => {
    const { messageID, reaction, senderID } = event;
    if (!reaction) return false;

    if (global.RiyadBot.onReaction.has(messageID)) {
      const reactionData = global.RiyadBot.onReaction.get(messageID);
      
      const cmd = commandLoader.commands.get(reactionData.commandName);
      if (cmd && typeof cmd.onReaction === 'function') {
        try {
          logger.info(`[Reaction Manager] Executing onReaction for command '${reactionData.commandName}'`);
          await cmd.onReaction({
            api,
            event,
            reactionData,
            message: api
          });
          return true;
        } catch (err) {
          logger.error(`Error in onReaction handler of command '${reactionData.commandName}':`, err);
        }
      }
    }
    return false;
  },

  /**
   * Clean up expired reaction listeners (older than 30 mins)
   */
  cleanExpired: () => {
    const now = Date.now();
    const expiryLimit = 30 * 60 * 1000; // 30 minutes
    let count = 0;
    
    for (const [key, val] of global.RiyadBot.onReaction.entries()) {
      if (now - val.timestamp > expiryLimit) {
        global.RiyadBot.onReaction.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.info(`[Reaction Manager] Pruned ${count} expired reaction listeners.`);
    }
  }
};

module.exports = reactionManager;
