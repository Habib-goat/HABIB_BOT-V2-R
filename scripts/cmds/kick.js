module.exports = {
  config: {
    name: "kick",
    version: "1.6.0",
    author: "NTKhang (Converted & Fixed)",
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

// The cached thread.members list only gets populated by "refresh group"
// (see refresh.js) — if nobody has run that yet, it's still []. Since
// E2EE name-matching below depends entirely on it, fetch live from
// Facebook as a fallback instead of failing with "please tag the member".
if ((!threadInfo.members || threadInfo.members.length === 0) && typeof api.getThreadInfo === "function") {
  try {
    const liveInfo = await api.getThreadInfo(threadID);
    const adminIDs = (liveInfo.adminIDs || []).map(x => String(x.id || x));
    threadInfo.members = (liveInfo.userInfo || []).map(u => ({
      userID: String(u.id),
      name: u.name || "",
      isAdmin: adminIDs.includes(String(u.id))
    }));
    // Best-effort cache write so next time this doesn't need a live fetch.
    try { await threadsData.updateThread(threadID, { members: threadInfo.members }); } catch (e) {}
  } catch (e) {
    console.error("[kick] live getThreadInfo fallback failed:", e.message || e);
  }
}

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
      let uids = Object.keys(mentions || {});

      // E2EE fallback: encrypted messages carry no mentions metadata,
      // only raw text. Match the tagged name against known group
      // members by name instead.
      if (uids.length === 0) {
        const rawText = args.join(" ").replace(/^@/, "").trim().toLowerCase();
        const members = (threadInfo.members || []);
        const matched = members.filter(m =>
          m.name && rawText.includes(m.name.toLowerCase()) && String(m.userID) !== String(botID)
        );
        if (matched.length > 0) {
          uids = matched.map(m => String(m.userID));
        }
      }

      if (uids.length === 0) {
        return api.sendMessage("⚠️ Please tag the member you want to kick.", threadID, messageID);
      }
      
      await Promise.all(uids.map(async (uid) => {
        await kickAndCheckError(uid);
      }));
    }
  }
};
