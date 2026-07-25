module.exports = {
  config: {
    name: "callWelcome",
    version: "1.0.0",
    author: "Riyad",
    eventType: ["log:thread-call"]
  },

  onStart: async function ({ api, event, threadsData, usersData }) {
    try {
      if (event.logMessageType !== "log:thread-call") return;

      const threadID = event.threadID;
      const joinUserID =
        event.logMessageData?.joining_user ||
        event.author;

      if (!joinUserID) return;

      // ===== Bot Owner Ignore =====
      const ownerIDs = [
        "61574930690578" // এখানে তোমার Bot Owner UID দাও
      ];

      if (ownerIDs.includes(joinUserID)) return;

      // ===== User Name =====
      let userName = "Unknown User";

try {
  const info = await api.getUserInfo(joinUserID);
  userName = info?.[joinUserID]?.name || "Unknown User";
} catch (e) {
  console.error("getUserInfo:", e);
}

      // ===== Group Name =====
      let groupName = "Unknown Group";

      try {
        const thread = await api.getThreadInfo(threadID);
const groupName = thread.threadName || "Unknown Group";
        
        if (thread)
          groupName =
            thread.threadName ||
            thread.name ||
            groupName;
      } catch {}

      const msg =
`📞 𝗖𝗔𝗟𝗟 𝗪𝗘𝗟𝗖𝗢𝗠𝗘

👋 Welcome ${userName}

💖 Thanks for joining the group call.

👥 Group
${groupName}

✨ Enjoy your conversation!`;

      api.sendMessage(
        {
          body: msg,
          mentions: [{
            tag: userName,
            id: joinUserID
          }]
        },
        threadID
      );

    } catch (err) {
      console.error("[CALLWELCOME ERROR]", err);
    }
  }
};
