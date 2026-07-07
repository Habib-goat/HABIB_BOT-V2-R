const config = require('../../config.json');

module.exports = {
  config: {
    name: "owner",
    aliases: ["admin", "developer", "creator", "info"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 3,
    role: 0,
    category: "info",
    guide: {
      en: "{pn}"
    },
    description: {
      en: "View developer and project contact links."
    }
  },

  onStart: async function({ api, event }) {
    let ownerInfo = `👤 ━━━━ [ RIYAD BOT DEVELOPER ] ━━━━ 👤\n\n`;
    ownerInfo += `👑 Main Developer: Hasan Riyad\n`;
    ownerInfo += `🌐 Github: https://github.com/namebdmy/Riyad_Pro/\n`;
    ownerInfo += `📧 Contact: hasanriyad761@gmail.com\n`;
    ownerInfo += `💬 Messenger ID: ${config.ownerIDs[0]}\n`;
    ownerInfo += `💡 Framework: Riyad Bot Framework V1.0.0\n`;
    ownerInfo += `📜 License: MIT Open Source\n\n`;
    ownerInfo += `Thank you for choosing Riyad Bot! Build your own plugins or commands easily with our GoatBot compatibility layers.`;

    await api.sendMessage(ownerInfo, event.threadID);
  }
};
