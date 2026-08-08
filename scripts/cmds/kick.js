module.exports = {
  config: {
    name: "kick",
    version: "1.5.0",
    author: "NTKhang (Converted & Fixed)",
    countDown: 5,
    role: 1,
    description: "Remove members from the chat box.",
    category: "owner",
    guide: "{pn} @tags (or reply to user's message)"
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID, messageReply, mentions } = event;
    
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
    "Permission Denied: bot needs to be Group Admin to remove members.",
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
      "Error: " +
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
        return api.sendMessage("Usage error: Please tag a member or reply to their message to kick them.", threadID, messageID);
      }
      await kickAndCheckError(messageReply.senderID);
    } else {
      let uids = Object.keys(mentions || {});

      if (uids.length === 0) {
        const rawText = args.join(" ").replace(/^@/, "").trim().toLowerCase();

        let members = threadInfo.members || [];
        if (typeof api.getThreadInfo === "function") {
          const liveInfo = await api.getThreadInfo(threadID).catch(() => null);
          if (liveInfo && Array.isArray(liveInfo.userInfo) && liveInfo.userInfo.length > 0) {
            members = liveInfo.userInfo.map(u => ({ userID: u.id || u.userID, name: u.name }));
          } else if (liveInfo && Array.isArray(liveInfo.participantIDs)) {
            members = liveInfo.participantIDs.map(id => ({ userID: id, name: "" }));
          }
        }

        const matched = members.filter(m =>
          m.name && rawText.includes(m.name.toLowerCase()) && String(m.userID) !== String(botID)
        );
        if (matched.length > 0) {
          uids = matched.map(m => String(m.userID));
        }
      }

      if (uids.length === 0) {
        return api.sendMessage("Please tag the member you want to kick.", threadID, messageID);
      }
      
      await Promise.all(uids.map(async (uid) => {
        await kickAndCheckError(uid);
      }));
    }
  }
};
