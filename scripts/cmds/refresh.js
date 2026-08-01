module.exports = {
  config: {
    name: "refresh",
    aliases: ["reload-info", "sync"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 10,
    role: 0,
    category: "box chat",
    guide: {
      en: "{pn} [thread | group]: refresh info of the current group\n"
        + "{pn} group <threadID>: refresh info of a group by ID\n\n"
        + "{pn} user: refresh your own info\n"
        + "{pn} user [<userID> | @tag]: refresh info of a user by ID/mention"
    },
    description: {
      en: "Refresh cached group chat or user information."
    }
  },

  onStart: async function ({ api, event, args, usersData, threadsData }) {
    const { threadID, messageID, senderID, mentions } = event;

    try {
      if (args[0] === "group" || args[0] === "thread") {
        const targetID = args[1] || threadID;

        try {
          const info = await api.getThreadInfo(targetID);
          await threadsData.updateThread(targetID, {
            id: String(targetID),
            name: info.threadName || info.name || "Unknown Group",
            adminIDs: (info.adminIDs || []).map(x => String(x.id || x)),
            approvalMode: Boolean(info.approvalMode),
            lastSync: Date.now()
          });

          const successMsg = targetID == threadID
            ? "✅ | Refreshed your group chat info successfully!"
            : `✅ | Refreshed group chat ${targetID} info successfully!`;

          return api.sendMessage(successMsg, threadID, messageID);
        } catch (error) {
          const errorMsg = targetID == threadID
            ? "❌ | Failed to refresh your group chat info."
            : `❌ | Failed to refresh group chat ${targetID} info.`;

          return api.sendMessage(errorMsg, threadID, messageID);
        }
      }

      if (args[0] === "user") {
        let targetID = senderID;

        if (args[1]) {
          if (mentions && Object.keys(mentions).length > 0) {
            targetID = Object.keys(mentions)[0];
          } else {
            targetID = args[1];
          }
        }

        try {
          const info = await api.getUserInfo(targetID);
          const realName = info?.[targetID]?.name || info?.[targetID]?.fullName;

          if (realName) {
            await usersData.updateUser(targetID, { name: realName });
          }

          const successMsg = targetID == senderID
            ? "✅ | Refreshed your user info successfully!"
            : `✅ | Refreshed user ${targetID} info successfully!`;

          return api.sendMessage(successMsg, threadID, messageID);
        } catch (error) {
          const errorMsg = targetID == senderID
            ? "❌ | Failed to refresh your user info."
            : `❌ | Failed to refresh user ${targetID} info.`;

          return api.sendMessage(errorMsg, threadID, messageID);
        }
      }

      return api.sendMessage(
        "⚠️ | Wrong syntax. Use:\n{pn}group / {pn}thread\n{pn}user [id/@tag]".replace(
          /\{pn\}/g,
          "refresh "
        ),
        threadID,
        messageID
      );
    } catch (err) {
      return api.sendMessage(
        `❌ [ERROR] Something went wrong: ${err.message}`,
        threadID,
        messageID
      );
    }
  }
};
