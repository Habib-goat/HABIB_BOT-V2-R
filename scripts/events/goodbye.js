const config = require('../../config.json');
const database = require("../utils/database");

module.exports = {
  config: {
    name: "goodbye",
    eventType: ["log:unsubscribe"],
    version: "1.1.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    let thread = null;
    try {
      thread = await threadsData.getThread(threadID);
    } catch (err) {
      console.error("[GOODBYE] getThread ERROR:", err?.message || err);
    }

    const groupName = thread?.name || "Unknown Group";

    // AntiLeave চালু থাকলে Goodbye message পাঠাবে না
    if (
      thread &&
      (thread.antileave === true ||
        thread.antiLeave === true ||
        thread.settings?.antileave === true ||
        thread.settings?.antiLeave === true ||
        (thread.data && (thread.data.antileave === true || thread.data.antiLeave === true)))
    ) {
      return;
    }

    const leftParticipantID = String(event.logMessageData?.leftParticipantFbId || "");
    if (!leftParticipantID) return;

    let leftParticipantName = `User ${leftParticipantID.slice(-4)}`;
    try {
      const user = await database.getUser(leftParticipantID);
      if (user?.name) leftParticipantName = user.name;
    } catch (err) {
      // Fallback name already set above
    }

    // Try getUserInfo from api as additional fallback
    if (leftParticipantName.startsWith("User ")) {
      try {
        if (typeof api.getUserInfo === "function") {
          const info = await api.getUserInfo(leftParticipantID);
          if (info?.[leftParticipantID]?.name) {
            leftParticipantName = info[leftParticipantID].name;
          }
        }
      } catch (err) {
        // Keep fallback name
      }
    }

    const msg = `╭━━━〔 🥀 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 🥀 〕━━━╮

◈ ━━━━━━ ⸙ ━━━━━━ ◈

⚡ 𝗠𝗘𝗠𝗕𝗘𝗥: ◤ ${leftParticipantName} ◢ 🔥

⚛️ 𝗚𝗥𝗢𝗨𝗣: ◤ ${groupName} ◢ ❄️

◈ ━━━━━━ ⸙ ━━━━━━ ◈

❤️‍🩹 যদি কখনো আবার ফিরে আসতে মন চায়, তবে নির্দ্বিধায় আমাদের ইনবক্সে একটি মেসেজ দিয়ো। 📩

🔥 আমরা তোমাকে সাদরে আবারও আমাদের গ্রুপে অ্যাড করে নেবো। 🤝✨

🍃 ভালো থেকো, নিজের খেয়াল রেখো সবসময়। 💫

🤍 আল্লাহ হাফেজ! 🌸

✨ আবার দেখা হবে, শুভকামনা রইল! 🎉

╰━━〔 ⚡ 𝐒𝐄𝐄 𝐘𝐎𝐔 𝐒𝐎𝐎𝐍 ⚡ 〕━━╯`;

    try {
      await api.sendMessage({
        body: msg,
        mentions: [{
          id: leftParticipantID,
          tag: leftParticipantName
        }]
      }, threadID);
    } catch (err) {
      console.error("[GOODBYE] sendMessage ERROR:", err?.message || err);
    }
  }
};
