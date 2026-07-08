const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "pp",
    version: "2.0.0",
    author: "Riyad Bot",
    countDown: 3,
    role: 0,
    category: "media",
    guide: {
      en: "{pn} [reply/@mention/UID]"
    },
    description: {
      en: "View Facebook profile picture"
    }
  },

  onStart: async function ({ api, event, args }) {
    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    const filePath = path.join(cacheDir, `pp_${Date.now()}.jpg`);

    try {
      let uid = event.senderID;

      if (event.messageReply)
        uid = event.messageReply.senderID;
      else if (Object.keys(event.mentions || {}).length)
        uid = Object.keys(event.mentions)[0];
      else if (args[0] && /^\d+$/.test(args[0]))
        uid = args[0];

      let name = "Facebook User";
      try {
        const info = await api.getUserInfo(uid);
        if (info && info[uid] && info[uid].name)
          name = info[uid].name;
      } catch {}

      const url = `https://graph.facebook.com/${uid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

      const res = await axios.get(url, { responseType: "arraybuffer" });
      await fs.writeFile(filePath, res.data);

      await api.sendMessage(
        {
          body: `📸 Profile Picture of ${name}`,
          attachment: fs.createReadStream(filePath)
        },
        event.threadID
      );

      fs.remove(filePath);

    } catch (e) {
      console.error("[PP]", e);
      api.sendMessage("❌ Failed to fetch profile picture.", event.threadID);
    }
  }
};
