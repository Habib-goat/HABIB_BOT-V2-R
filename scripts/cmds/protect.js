module.exports = {
  config: {
    name: "protect",
    version: "1.2",
    author: "MOHAMMAD AKASH",
    role: 2,
    shortDescription: "Lock group name, nickname, theme, emoji",
    category: "group",
    guide: "{pn} on/off"
  },

  onStart: async ({ api, event, message, threadsData, args }) => {
  console.log("ARGS =", args);
  console.log("BODY =", event.body);

  const { threadID } = event;

    if (!args[0]) {
  return api.sendMessage(
    "⚠️ Usage: /protect on | /protect off",
    threadID
  );
}
    
    if (args[0] === "on") {
      const info = await api.getThreadInfo(threadID);

      const protectData = {
        enable: true,
        name: info.threadName || "",
        emoji: info.emoji || "",
        color: info.color || "",
        nickname: {}
      };

      // Safely handle members
      const members = info.members || [];
      members.forEach(u => {
        protectData.nickname[u.userID] = u.nickname || "";
      });

      const thread = await threadsData.getThread(threadID);

await threadsData.updateThread(threadID, {
  settings: {
    ...thread.settings,
    protect: protectData
  }
});

      return api.sendMessage(
  "🛡 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n✨ Name, Nickname, Theme & Emoji are now LOCKED!",
  threadID
);
    }

    if (args[0] === "off") {
      const thread = await threadsData.getThread(threadID);

await threadsData.updateThread(threadID, {
  settings: {
    ...thread.settings,
    protect: {
      enable: false
    }
  }
});
      return api.sendMessage(
  "🔓 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗗𝗜𝗦𝗔𝗕𝗟𝗘𝗗\n💥 All locks are now OFF!",
  threadID
);
    }
  },

  onEvent: async ({ api, event, threadsData }) => {
  try {
    console.log("PROTECT EVENT:", event.logMessageType);

    const { threadID, author, logMessageType, logMessageData } = event;
    const thread = await threadsData.getThread(threadID);
    const protectData = thread.settings?.protect || {};

    if (!protectData?.enable) return;

    const info = await api.getThreadInfo(threadID);
    const isBot = api.getCurrentUserID() === author;

    if (!isBot) {
      if (logMessageType === "log:thread-name") {
        await api.setTitle(protectData.name, threadID);
      }

      if (logMessageType === "log:thread-icon") {
        await api.changeThreadEmoji(protectData.emoji, threadID);
      }

      if (logMessageType === "log:thread-color") {
        await api.changeThreadColor(protectData.color, threadID);
      }

      if (logMessageType === "log:user-nickname") {
        const { participant_id } = logMessageData;
        await api.changeNickname(
          protectData.nickname[participant_id] || "",
          threadID,
          participant_id
        );
      }
    }
  } catch (err) {
    console.error("PROTECT ERROR:", err);
  }
}
};
