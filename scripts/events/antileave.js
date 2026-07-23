module.exports = {
  config: {
    name: "antileave",
    version: "1.1.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);
    const authorID = String(event.author || "");

    // শুধু নিজে Leave করলে কাজ করবে
    if (leftUserID !== authorID) return;

    let botID = "";
try {
  if (api.getCurrentUserID && typeof api.getCurrentUserID === "function") {
    botID = String(api.getCurrentUserID());
  } else {
    botID = String(api.getCurrentUserID || api.botID || "");
  }
} catch (e) {
  botID = String(api.getCurrentUserID || api.botID || "");
}

    // বট নিজে Leave করলে কিছু করবে না
    if (leftUserID === botID) return;

    console.log("[ANTILEAVE] Re-adding:", leftUserID);

    try {
  console.log("LEFT USER ID:", leftUserID);
  console.log("THREAD ID:", threadID);

  await api.addUserToGroup(String(leftUserID), String(threadID));

  console.log("✅ USER RE-ADDED");
} catch (err) {
  console.error("❌ ADD ERROR:", err);

  return api.sendMessage(
    JSON.stringify(err, null, 2),
    threadID
  );
}

    // ৩ সেকেন্ড অপেক্ষা
    await new Promise(resolve => setTimeout(resolve, 3000));

    let userName = "Member";

    try {
      const info = await new Promise(resolve => {
        api.getUserInfo(leftUserID, (err, data) => {
          if (err) return resolve(null);
          resolve(data);
        });
      });

      if (info && info[leftUserID]) {
        userName = info[leftUserID].name;
      }
    } catch (e) {}

    await api.sendMessage(
      {
        body:
`╔═══════════════════╗
║ 🔥𝐑𝐈𝐘𝐀𝐃 𝐁𝐎𝐓 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘⚡║
╠═══════════════════╣
║
║ 👋 ${userName}
║
║ ⚠️ আপনি গ্রুপ থেকে বের হওয়ার
║ চেষ্টা করেছিলেন! 🚫
║
║ ⚡ Riyad Bot-এর অনুমতি ব্যতীত
║ এই গ্রুপ ত্যাগ করা অসম্ভব। 🔒
║
║ ✅ আপনাকে পুনরায় গ্রুপে
║ সংযুক্ত করা হয়েছে। 🔄
║
║ ❤️💎 🚀 ⚛️
╠════════════════════╣
║ ⚡ 𝐁𝐎𝐓 𝐒𝐘𝐒𝐓𝐄𝐌 𝐀𝐂𝐓𝐈𝐕𝐄 ⚡  ║
╚════════════════════╝`,
        mentions: [
          {
            tag: userName,
            id: leftUserID
          }
        ]
      },
      threadID
    );

    console.log("✅ SECURITY MESSAGE SENT");
  }
};
