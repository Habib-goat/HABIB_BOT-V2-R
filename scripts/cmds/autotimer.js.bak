const autoTimer = require("../services/autotimerService");

module.exports = {
  config: {
    name: "autotimer",
    aliases: ["atimer", "autotime"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 3,
    role: 0,
    category: "system",
    guide: {
      en: "{pn} [on/off]"
    },
    description: {
      en: "Enable or disable AutoTimer in this group."
    }
  },

  onStart: async function ({ api, event, args }) {
    const threadID = event.threadID;

    if (!args[0]) {
      const status = autoTimer.getThreadStatus(threadID);

      return api.sendMessage(
        `⏰ AutoTimer is currently ${status ? "🟢 ON" : "🔴 OFF"}.\n\nUse:\n/autotimer on\n/autotimer off`,
        threadID
      );
    }

    const option = args[0].toLowerCase();

    if (option === "on") {
      autoTimer.setThreadStatus(threadID, true);

      return api.sendMessage(
        "✅ AutoTimer has been enabled for this group.",
        threadID
      );
    }

    if (option === "off") {
      autoTimer.setThreadStatus(threadID, false);

      return api.sendMessage(
        "❌ AutoTimer has been disabled for this group.",
        threadID
      );
    }

    return api.sendMessage(
      "⚠️ Invalid option.\nUse:\n/autotimer on\n/autotimer off",
      threadID
    );
  }
};
