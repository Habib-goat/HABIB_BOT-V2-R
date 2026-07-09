const config = require('../../config.json');
const database = require("../../utils/database");

module.exports = {
  config: {
    name: "goodbye",
    eventType: ["log:unsubscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType !== "log:unsubscribe")
      return;

    const { threadID } = event;

console.log("usersData methods:", Object.keys(usersData || {}));

const thread = threadsData.getThread(threadID);

    const leftParticipantID = String(event.logMessageData.leftParticipantFbId);
    let leftParticipantName;

try {
  leftParticipantName = database.getUser(leftParticipantID).name;
  console.log("Goodbye Name:", leftParticipantName);
} catch (err) {
  leftParticipantName = `User ${leftParticipantID.slice(-4)}`;
}

    const msg = `╭━━━〔 🥀 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 🥀 〕━━━╮

◈ ━━━━━━ ⸙ ━━━━━━ ◈

⚡ 𝗠𝗘𝗠𝗕𝗘𝗥: ◤ ${leftParticipantName} ◢ 🔥

⚛️ 𝗚𝗥𝗢𝗨𝗣: ◤ ${thread.name} ◢ ❄️

◈ ━━━━━━ ⸙ ━━━━━━ ◈

❤️‍🩹 যদি কখনো আবার ফিরে আসতে মন চায়, তবে নির্দ্বিধায় আমাদের ইনবক্সে একটি মেসেজ দিয়ো। 📩

🔥 আমরা তোমাকে সাদরে আবারও আমাদের গ্রুপে অ্যাড করে নেবো। 🤝✨

🍃 ভালো থেকো, নিজের খেয়াল রেখো সবসময়। 💫

🤍 আল্লাহ হাফেজ! 🌸

✨ আবার দেখা হবে, শুভকামনা রইল! 🎉

╰━━〔 ⚡ 𝐒𝐄𝐄 𝐘𝐎𝐔 𝐒𝐎𝐎𝐍 ⚡ 〕━━╯`;

    await api.sendMessage({
      body: msg,
      mentions: [{
        id: leftParticipantID,
        tag: leftParticipantName
      }]
    }, threadID);
  }
};
