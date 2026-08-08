module.exports = {
  config: {
    name: "kick",
    version: "1.5.0",
    author: "Riyad (E2EE & Fixed)",
    countDown: 5,
    role: 1,
    description: "Remove members from the chat box.",
    category: "owner",
    guide: "{pn} @tags (or reply to user's message)"
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID, messageReply, mentions } = event;
    
    // FRAMEWORK-COMPATIBLE BOT ID RESOLUTION (Fixes getCurrentUserID is not a function)
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
let threadInfo = {};
try {
  threadInfo = await threadsData.getThread(threadID) || {};
} catch (e) {}

const botMember = (threadInfo.members || []).find(
  m => String(m.userID) === String(botID)
);

if (botID && botMember && botMember.isAdmin === false) {
  return api.sendMessage(
    "⚠️ Permission Denied: The bot needs to be a Group Administrator to remove members.",
    threadID,
    messageID
  );
}
const kickAndCheckError = async (uid) => {
  try {
    await api.removeUserFromGroup(uid, threadID);
    return true;
  } catch (e) {
    console.log("===== KICK ERROR =====");
    console.log(e);
    console.log("======================");

    return api.sendMessage(
      "❌ " +
      (e?.errorDescription ||
       e?.error ||
       e?.message ||
       JSON.stringify(e)),
      threadID,
      messageID
    );
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
      
      await Promise.all(uids.map(async (uid) => {
        await kickAndCheckError(uid);
      }));
    }
  }
};
