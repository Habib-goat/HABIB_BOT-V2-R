/**
 * Riyad Bot Framework - Reaction Manager
 */

const logger = require("../utils/logger");
const path = require("path");

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

  async handle(api, event, commandLoader) {
    const { messageID, reaction } = event;

    if (!messageID) return false;

    const reactionData = reactions.get(String(messageID));

    // 🤬 Auto Unsend
    if (reaction === "🤬" && reactionData) {
      const reactor = String(event.userID || event.senderID || "");

      const admins = [
        ...(config.adminIDs || []),
        ...(config.ownerIDs || [])
      ].map(String);

      if (admins.includes(reactor)) {
        try {
          await api.unsendMessage(messageID);

          reactions.delete(String(messageID));
          return true;
        } catch (err) {
          logger.error("Reaction unsend failed:", err);
        }
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
