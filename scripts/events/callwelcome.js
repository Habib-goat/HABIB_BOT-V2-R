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
let groupName = "Unknown Group";

try {
  const info = await api.getUserInfo(joinUserID);
  if (info?.[joinUserID]?.name)
    userName = info[joinUserID].name;
} catch {}

try {
  const thread = await api.getThreadInfo(threadID);
  if (thread?.threadName)
    groupName = thread.threadName;
} catch {
  try {
    const thread = await threadsData.getThread(threadID);
    if (thread)
      groupName = thread.threadName || thread.name || "Unknown Group";
  } catch {}
}

      const msg = `╭───❖ 💞 𝑪𝒂𝒍𝒍 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 ❖───╮

🌸 𝐀𝐬𝐬𝐚𝐥𝐚𝐦𝐮 𝐀𝐥𝐚𝐢𝐤𝐮𝐦
✨ ${userName}

💖 আমাদের ছোট্ট পরিবারে কলে
যুক্ত হওয়ার জন্য আন্তরিক ধন্যবাদ।❤️

🏡 ${groupName}

🌷 আশা করি সবার সাথে 
😍সুন্দর কিছু মুহূর্ত কাটবে।🌺

╰─────────🤍────────╯`;

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
