const config = require('../../config.json');
const fs = require("fs-extra");
const request = require("request");
const path = require("path");

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

  onStart: async function ({ api, event }) {

  const cacheDir = path.join(__dirname, "cache");
  const imgPath = path.join(cacheDir, "owner.jpg");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
  }

  const imgLink = "https://i.imgur.com/kNMyJXk.jpeg";

  const ownerInfo = `‎‎╔═ ❖👑 𝑶𝑾𝑵𝑬𝑹 𝑰𝑵𝑭𝑶 👑❖ ═╗

❖ 👤 𝑵𝒂𝒎𝒆        ⟿ 𝑩𝒂𝒅 𝑩𝒐𝒚 𝑹𝒊𝒚𝒂𝒅
❖ 🧸 𝑵𝒊𝒄𝒌          ⟿ 𝑹𝒊𝒚𝒂𝒅
❖ 🎂 𝑨𝒈𝒆            ⟿ 18+
❖ 💘 𝑹𝒆𝒍𝒂𝒕𝒊𝒐𝒏     ⟿ 𝑺𝒊𝒏𝒈𝒍𝒆
❖ 🎓 𝑷𝒓𝒐𝒇𝒆𝒔𝒔𝒊𝒐𝒏  ⟿ 𝑺𝒕𝒖𝒅𝒆𝒏𝒕
❖ 📚 𝑬𝒅𝒖𝒄𝒂𝒕𝒊𝒐𝒏  ⟿ 𝑰𝒏𝒕𝒆𝒓 2𝒏𝒅 𝒀𝒆𝒂𝒓
❖ 🏡 𝑳𝒐𝒄𝒂𝒕𝒊𝒐𝒏    ⟿ 𝑩𝒐𝒈𝒖𝒓𝒂 • 𝑺𝒉𝒆𝒓𝒑𝒖𝒓

╠═══ 🔗 𝑪𝑶𝑵𝑻𝑨𝑪𝑻 🔗 ═══╣

📘 𝑭𝒂𝒄𝒆𝒃𝒐𝒐𝒌   ➜ fb.com/badboyriyad
💬 𝑰𝒏𝒔𝒕𝒂𝒈𝒓𝒂𝒎 ➜ insta.com/chocoriyad
📞 𝑾𝒉𝒂𝒕𝒔𝑨𝒑𝒑 ➜ wa.me/01863691054

━━━━━━━━━━━━━━━━━━━━━━

🌐 GitHub      ➜ https://github.com/namebdmy/Riyad_Pro/
📧 Email       ➜ hasanriyad761@gmail.com
💬 Messenger ID ➜ ${config.ownerIDs[0]}
💡 Framework   ➜ Riyad Bot Framework V1.0.0
📜 License     ➜ MIT Open Source

╚══ ❖ 💎 𝑻𝒉𝒂𝒏𝒌 𝒀𝒐𝒖 💎 ❖ ══╝`;

  request(imgLink)
    .pipe(fs.createWriteStream(imgPath))
    .on("close", () => {
      api.sendMessage(
        {
          body: ownerInfo,
          attachment: fs.createReadStream(imgPath)
        },
        event.threadID,
        () => fs.unlinkSync(imgPath),
        event.messageID
            );
    });
  }
};
