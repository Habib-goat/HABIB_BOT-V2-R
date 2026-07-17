module.exports = {
  config: {
    name: "out",
    aliases: ["leave", "bye", "exit"],
    version: "1.0.0",
    author: "Riyad",
    role: 2,
    shortDescription: "Bot leaves the group"
  },

  onStart: async function ({ api, event }) {
    try {
      const botID = api.getCurrentUserID();

      await api.sendMessage(
        `╔══════════════════╗
║     ⚡ •°•𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧•°• ⚡
╠══════════════════╣
║          👋 𝗕𝗬𝗘! 👋
║ 💖 আমাকে ব্যবহার করার জন্য
║ আন্তরিক ধন্যবাদ।
║ 🤝 প্রয়োজনে আবার
║ যেকোনো সময় যোগ করুন। 🔥
║ 🌸 আল্লাহ হাফেজ! 🤍
╚══════════════════╝`,
        event.threadID
      );

      setTimeout(async () => {
        await api.removeUserFromGroup(botID, event.threadID);
      }, 1500);

    } catch (err) {
      console.log("Out command error:", err);
    }
  }
};
