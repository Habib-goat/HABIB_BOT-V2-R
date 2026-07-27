const botMessageTracker = require("../utils/botMessageTracker");

module.exports = {
  config: {
    name: "clear",
    aliases: ["unsendall", "clean"],
    author: "Riyad (Fixed)",
    version: "3.0.0",
    cooldowns: 5,
    role: 2,
    shortDescription: "Unsend recent messages sent by the bot.",
    longDescription: "Unsends recent messages the bot has sent in this thread (tracked in memory since login/restart).",
    category: "owner",
    guide: "{pn}"
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID } = event;

    try {
      // NOTE: the messenger adapter used by this framework (scripts/utils/messengerAdapter.js)
      // does not implement getThreadHistory, so we can't fetch history from Facebook directly.
      // Instead every message the bot sends is recorded in botMessageTracker, and we unsend
      // from that list. This only covers messages sent since the bot last started.
      const tracked = botMessageTracker.getForThread(threadID);

      if (!tracked || tracked.length === 0) {
        return api.sendMessage(
          "✅ No tracked bot messages found to clear in this thread (only messages sent since the bot last started are tracked).",
          threadID,
          messageID
        );
      }

      let success = 0;
      let failed = 0;

      for (const { messageID: mid } of tracked) {
        try {
          await api.unsendMessage(mid);
          success++;
        } catch (e) {
          failed++;
        }
        botMessageTracker.remove(threadID, mid);
        // Small delay between unsends so Facebook doesn't rate-limit/flag the account.
        await new Promise(r => setTimeout(r, 300));
      }

      const report =
        "🧹 Cleaned up " + success + " bot messages." +
        (failed > 0 ? " Failed to unsend " + failed + " messages (they may be over the unsent time limit)." : "");
      return api.sendMessage(report, threadID, messageID);
    } catch (err) {
      console.error("Clear Command Error:", err);
      return api.sendMessage("❌ Clear failed: " + err.message, threadID, messageID);
    }
  }
};
