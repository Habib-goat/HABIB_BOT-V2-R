const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "pin",
    aliases: ["pinterest", "pint"],
    version: "1.1.1",
    author: "Riyad",
    countDown: 5,
    role: 0,
    description: "Search Pinterest and return image results.",
    category: "image",
    guide: "{pn} [keyword]-[count] (e.g. {pn} Naruto-10)"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const keySearch = args.join(" ");

    if (!keySearch || keySearch.includes("-") === false) {
      return api.sendMessage("❌ Example: pin Riyad-10", threadID, messageID);
    }

    const keySearchs = keySearch.substr(0, keySearch.indexOf("-"));
    const numberSearch = Math.max(1, parseInt(keySearch.split("-").pop()) || 6);

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const statusMsg = await new Promise((resolve) => {
      api.sendMessage(`🔍 Searching Pinterest for "${keySearchs}"... Downloading ${numberSearch} image(s)...`, threadID, (err, info) => resolve(info), messageID);
    });

    const tempFiles = [];

    try {
      const apis = await axios.get("https://raw.githubusercontent.com/shaonproject/Shaon/main/api.json", { timeout: 12000 });
      const Shaon = apis.data.api;

      const res = await axios.get(`${Shaon}/pinterest?search=${encodeURIComponent(keySearchs)}`, { timeout: 12000 });
      const data = res.data.data;

      if (!Array.isArray(data) || data.length === 0) {
        if (statusMsg) try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
        return api.sendMessage("❌ No Pinterest results found for your search.", threadID, messageID);
      }

      const count = Math.min(numberSearch, data.length);
      const attachments = [];

      const downloadPromises = data.slice(0, count).map(async (imageUrl, idx) => {
        try {
          const fileId = `pin_${senderID}_${Date.now()}_${idx}.jpg`;
          const imagePath = path.join(cacheDir, fileId);

          const imgResponse = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 10000 });
          await fs.writeFile(imagePath, imgResponse.data);

          attachments.push(fs.createReadStream(imagePath));
          tempFiles.push(imagePath);
        } catch (err) {
          console.warn(`Failed to download Pinterest image ${idx + 1}:`, err.message);
        }
      });

      await Promise.all(downloadPromises);

      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
      }

      if (attachments.length === 0) {
        return api.sendMessage("❌ Failed to download Pinterest images. Please try again.", threadID, messageID);
      }

      return api.sendMessage({
        body: `📌 ${attachments.length} Pinterest results for: "${keySearchs}"`,
        attachment: attachments
      }, threadID, async () => {
        for (const filePath of tempFiles) {
          try {
            if (await fs.pathExists(filePath)) {
              await fs.remove(filePath);
            }
          } catch (e) {}
        }
      }, messageID);

    } catch (err) {
      console.error("Pin command error:", err);
      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch (e) {}
      }
      for (const filePath of tempFiles) {
        try { await fs.remove(filePath); } catch (e) {}
      }
      return api.sendMessage("⚠️ Failed to search Pinterest or download assets. The API might be offline.", threadID, messageID);
    }
  }
};
