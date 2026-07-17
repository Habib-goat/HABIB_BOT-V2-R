module.exports = {
  config: {
  name: "out",
  aliases: ["leave", "bye", "exit", "out"],
  version: "1.0.0",
  author: "Riyad",
  role: 1,
  shortDescription: "Bot leaves the group"
},

  onStart: async ({ api, event }) => {
    const { threadID } = event;

    const message = `╔══════════════════╗ 
║     ⚡ •°•𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧•°• ⚡ ╠══════════════════╣ 
║          👋『 বিদায়! 』👋 
║ 💖❝আমাকে 𝗨𝗦𝗘 করার জন্য❞ 
║     ✨ আন্তরিক ধন্যবাদ। ✨ 
║ 🤝 ❖ প্রয়োজনে আবার ❖ 
║     🔥 আমাকে এড করুন। 
║ 🌸 『 আল্লাহ হাফেজ! 』🤍 ╚══════════════════╝`;

    api.sendMessage(message, threadID, () => {
      if (typeof api.removeUserFromGroup === "function") {
        api.removeUserFromGroup(api.getCurrentUserID(), threadID);
      } else if (typeof api.removeSelfFromGroup === "function") {
        api.removeSelfFromGroup(threadID);
      } else {
        api.sendMessage(
          "❌ এই Messenger API-তে গ্রুপ থেকে স্বয়ংক্রিয়ভাবে বের হওয়ার ফাংশন পাওয়া যায়নি।",
          threadID
        );
      }
    });
  }
};
