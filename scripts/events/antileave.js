module.exports = {
  config: {
    name: "antileave",
    version: "1.0.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);

    const botID =
      typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : "";

    if (leftUserID === botID) return;

    const thread = await threadsData.getThread(threadID);

    if (
      !thread ||
      !(
        thread.antileave === true ||
        (thread.data && thread.data.antileave === true)
      )
    ) {
      return;
    }

    console.log("[ANTILEAVE] Re-adding:", leftUserID);

    try {
      await api.addUserToGroup(leftUserID, threadID);
      console.log("✅ USER RE-ADDED");
    } catch (err) {
      console.error("❌ ADD ERROR:", err);

      return api.sendMessage(
        `❌ Re-add Failed:\n${err.errorDescription || err.message || JSON.stringify(err)}`,
        threadID
      );
    }

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
    } catch {}

    await api.sendMessage({
      body: `╔═══════════════════╗
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
    }, threadID);

    console.log("✅ SECURITY MESSAGE SENT");
  }
};
