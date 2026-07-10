module.exports = {
  config: {
    name: "clear",
    aliases: ["unsendall", "clean"],
    author: "kshitiz (Fixed)",  
    version: "2.1.0",
    cooldowns: 5,
    role: 0,
    shortDescription: "Unsend recent messages sent by the bot.",
    longDescription: "Retrieves up to 100 recent messages in the current thread and unsends all that were sent by the bot.",
    category: "owner",
    guide: "{pn}"
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID } = event;
    
    let botID = "";
    try {
      if (api.getCurrentUserID && typeof api.getCurrentUserID === "function") {
        botID = api.getCurrentUserID();
      } else {
        botID = api.getCurrentUserID || api.botID || "";
      }
    } catch (e) {
      botID = api.getCurrentUserID || "";
    }

    try {
      const history = await api.getThreadHistory(threadID, 100);
      if (!history || !Array.isArray(history)) {
        return api.sendMessage("❌ Failed to retrieve thread history.", threadID, messageID);
      }

      const botMessages = history.filter(msg => msg.senderID === botID);

      if (botMessages.length === 0) {
        return api.sendMessage("✅ No recent bot messages found to clear.", threadID, messageID);
      }

      let success = 0;
      let failed = 0;

      for (const msg of botMessages) {
        try {
          await api.unsendMessage(msg.messageID);
          success++;
        } catch (e) {
          failed++;
        }
      }

      const report = "🧹 Cleaned up " + success + " bot messages." + (failed > 0 ? " Failed to unsend " + failed + " messages (they may be over the unsent limit / too old)." : "");
      return api.sendMessage(report, threadID, messageID);
    } catch (err) {
      console.error("Clear Command Error:", err);
      return api.sendMessage("❌ Clear failed: " + err.message, threadID, messageID);
    }
  }
};