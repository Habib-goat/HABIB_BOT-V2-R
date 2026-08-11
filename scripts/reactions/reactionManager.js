const logger = require("../utils/logger");
const database = require("../utils/database");
const path = require("path");

let config = {};
try {
  config = global.config || require(path.join(process.cwd(), "config.json"));
} catch (_) {}

const reactions = new Map();
const TTL = 30 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - TTL;
  for (const [id, data] of reactions) {
    if (data.timestamp < cutoff) reactions.delete(id);
  }
}, 10 * 60 * 1000);

module.exports = {
  register(messageID, data = {}) {
    if (!messageID) return;
    reactions.set(String(messageID), { ...data, timestamp: Date.now() });
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
    const messageID = event && (
      event.messageID ||
      event.messageId ||
      event.targetMessageID ||
      event.targetMessageId ||
      event.targetId
    );
    const reaction = event && event.reaction;
    if (!messageID || !reaction) return false;

    const data = reactions.get(String(messageID));
    const normalizedReaction = typeof reaction === "string"
      ? reaction
      : (reaction.emoji || reaction.reaction || "");

    // Angry reactions are the unsend action for bot/admin messages. E2EE
    // message IDs are tracked by the adapter, while normal reactions carry
    // the thread ID on the event for the MQTT fallback.
    if ((normalizedReaction === "🤬" || normalizedReaction === "😡") && data) {
      const reactorRaw = event.userID || event.senderID || event.senderId || event.from || "";
      const reactor = String(reactorRaw).match(/^(\d+)/)?.[1] || String(reactorRaw);
      const allowed = [
        ...(config.adminIDs || []),
        ...(config.ownerIDs || [])
      ].map(String);
      if (!allowed.includes(reactor)) return false;

      try {
        await api.unsendMessage(String(messageID), event.threadID || event.threadId);
        reactions.delete(String(messageID));
        return true;
      } catch (err) {
        logger.error("Reaction unsend failed:", err);
        return false;
      }
    }

    if (!data || data.commandName === "__global__") return false;
    const command = commandLoader.commands.get(data.commandName);
    if (!command || typeof command.onReaction !== "function") return false;

    try {
      await command.onReaction({
        api,
        event,
        Reaction: data,
        reactionData: data,
        args: event.body ? event.body.trim().split(/\s+/).slice(1) : [],
        message: api,
        usersData: database,
        threadsData: database,
        reactionManager: module.exports,
        replyManager: require("../replies/replyManager")
      });
      return true;
    } catch (err) {
      logger.error(`Error in onReaction '${data.commandName}':`, err);
      return false;
    }
  }
};
