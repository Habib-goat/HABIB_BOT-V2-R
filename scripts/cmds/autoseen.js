module.exports = {
  config: {
    name: "autoseen",
    aliases: ["seen", "markseen"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 2,
    role: 0,
    category: "system",
    guide: {
      en: "{pn} [on / off]"
    },
    description: {
      en: "Automatically mark incoming messages as read/seen in the background."
    }
  },

  // Runs silently on every incoming message event in the background
  onChat: async function({ api, event, threadsData }) {
    const threadID = event.threadID;
    if (!threadID) return;

    // Use threadsData to get thread settings and default to enabled (true)
    const threadData = threadsData.getThread(threadID);
    const isEnabled = threadData.settings && threadData.settings.autoseen !== false;

    if (!isEnabled) return;

    try {
      // Safely access the underlying Messenger API or the adapted API
      if (api && api.api && typeof api.api.markAsRead === "function") {
        api.api.markAsRead(threadID, (err) => {
          // Runs silently in background
        });
      } else if (api && typeof api.markAsRead === "function") {
        api.markAsRead(threadID, (err) => {
          // Runs silently in background
        });
      } else if (api && api.api && typeof api.api.markAsSeen === "function") {
        api.api.markAsSeen(threadID, (err) => {
          // Runs silently in background
        });
      }
    } catch (err) {
      // Prevent any background runtime exceptions from affecting other features
    }
  },

  // Handles manual trigger of the command
  onStart: async function({ api, event, args, threadsData }) {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const threadData = threadsData.getThread(threadID);

    // If no argument is provided, show current status
    if (args.length === 0) {
      const isEnabled = threadData.settings && threadData.settings.autoseen !== false;
      return api.sendMessage(
        `👁️ **Auto-Seen is currently ${isEnabled ? "ENABLED ✅" : "DISABLED ❌"} for this thread.**\n\nTo toggle, use:\n» \`/autoseen on\`\n» \`/autoseen off\``,
        threadID,
        messageID
      );
    }

    const state = args[0].toLowerCase();
    if (state === "on" || state === "enable" || state === "true") {
      if (!threadData.settings) {
        threadData.settings = {};
      }
      threadData.settings.autoseen = true;
      threadsData.updateThread(threadID, { settings: threadData.settings });

      return api.sendMessage(
        `✅ **Auto-Seen has been enabled for this thread.**\nIncoming messages will now be automatically marked as read in the background.`,
        threadID,
        messageID
      );
    } else if (state === "off" || state === "disable" || state === "false") {
      if (!threadData.settings) {
        threadData.settings = {};
      }
      threadData.settings.autoseen = false;
      threadsData.updateThread(threadID, { settings: threadData.settings });

      return api.sendMessage(
        `❌ **Auto-Seen has been disabled for this thread.**\nMessages will no longer be automatically marked as seen in this chat.`,
        threadID,
        messageID
      );
    } else {
      return api.sendMessage(
        `⚠️ Invalid parameter! Use \`/autoseen on\` or \`/autoseen off\`.`,
        threadID,
        messageID
      );
    }
  }
};
