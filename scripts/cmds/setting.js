/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  config: {
    name: "settings",
    version: "1.0.0",
    hasPermission: 2,
    credits: "Riyad",
    description: "Bot Settings System",
    commandCategory: "System",
    usages: "",
    cooldowns: 5
  },

  onStart: async function ({ api, event, replyManager }) {
    const { threadID, messageID, senderID } = event;

    const menu = `⚙️ BOT SETTINGS
━━━━━━━━━━━━━━━━━
1. Bot Config
2. Admin Manage
3. Whitelist Manage
4. Welcome
5. Goodbye
6. Security
7. Automation
8. AI Settings
9. Permission
10. Backup
11. Developer
12. About
━━━━━━━━━━━━━━━━━
› Reply 0 to Close
› Reply a number (0-12)`;

    const info = await api.sendMessage(menu, threadID, messageID);

    replyManager.set(info.messageID, {
      commandName: "settings",
      authorID: senderID,
      menu: "main"
    });
  },

  onReply: async function ({ api, event, Reply, replyManager }) {
    const { threadID, messageID, senderID, body } = event;

    // Only the command author can reply
    if (Reply.authorID !== senderID) return;

    // Remove previous reply handle
    replyManager.delete(Reply.messageID);

    const choice = parseInt(body);

    if (isNaN(choice)) {
      return api.sendMessage(
        "❌ Please reply with a number.",
        threadID,
        messageID
      );
    }

    switch (Reply.menu) {

      case "main":

        switch (choice) {

          case 1:
            return api.sendMessage(
              "🛠 Bot Config (Coming in Part 2)",
              threadID,
              messageID
            );

          case 2:
            return api.sendMessage(
              "👑 Admin Manage (Coming Soon)",
              threadID,
              messageID
            );

          case 3:
            return api.sendMessage(
              "📋 Whitelist Manage (Coming Soon)",
              threadID,
              messageID
            );

          case 4:
            return api.sendMessage(
              "👋 Welcome (Coming Soon)",
              threadID,
              messageID
            );

          case 5:
            return api.sendMessage(
              "👋 Goodbye (Coming Soon)",
              threadID,
              messageID
            );

          case 6:
            return api.sendMessage(
              "🛡 Security (Coming Soon)",
              threadID,
              messageID
            );

          case 7:
            return api.sendMessage(
              "🤖 Automation (Coming Soon)",
              threadID,
              messageID
            );

          case 8:
            return api.sendMessage(
              "🧠 AI Settings (Coming Soon)",
              threadID,
              messageID
            );

          case 9:
            return api.sendMessage(
              "🔐 Permission (Coming Soon)",
              threadID,
              messageID
            );

          case 10:
            return api.sendMessage(
              "💾 Backup (Coming Soon)",
              threadID,
              messageID
            );

          case 11:
            return api.sendMessage(
              "⚡ Developer (Coming Soon)",
              threadID,
              messageID
            );

          case 12:
            return api.sendMessage(
              "ℹ️ About (Coming Soon)",
              threadID,
              messageID
            );

          case 0:
            return api.sendMessage(
              "✅ Settings closed.",
              threadID,
              messageID
            );

          default:
            return api.sendMessage(
              "❌ Invalid option.\nReply with a number between 0 and 12.",
              threadID,
              messageID
            );
        }
    }
  }
};
