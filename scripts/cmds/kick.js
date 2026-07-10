module.exports = {
  config: {
    name: "kick",
    version: "1.4.0",
    author: "NTKhang (Converted)",
    countDown: 5,
    role: 1,
    description: "Remove members from the chat box.",
    category: "owner",
    guide: "{pn} @tags (or reply to user's message)"
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID, messageReply, mentions } = event;
    const botID = api.getCurrentUserID();

    let threadInfo;
    try {
      threadInfo = await threadsData.getThread(threadID) || {};
    } catch (err) {
      threadInfo = {};
    }

    const adminIDs = threadInfo.adminIDs || [];
    
    if (!adminIDs.includes(botID)) {
      return api.sendMessage("⚠️ Permission Denied: The bot needs to be a Group Administrator to remove members.", threadID, messageID);
    }

    const kickAndCheckError = async (uid) => {
      try {
        await api.removeUserFromGroup(uid, threadID);
        return true;
      } catch (e) {
        api.sendMessage(`❌ Could not kick user with ID \${uid}. Make sure they are still in the group and the bot has correct permissions.`, threadID, messageID);
        return false;
      }
    };

    if (!args[0]) {
      if (!messageReply) {
        return api.sendMessage("⚠️ Usage error: Please tag a member or reply to their message to kick them.", threadID, messageID);
      }
      await kickAndCheckError(messageReply.senderID);
    } else {
      const uids = Object.keys(mentions || {});
      if (uids.length === 0) {
        return api.sendMessage("⚠️ Please tag the member you want to kick.", threadID, messageID);
      }
      
      const success = 0;
      await Promise.all(uids.map(async (uid) => {
        await kickAndCheckError(uid);
      }));
    }
  }
};