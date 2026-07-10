const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "pinterest",
    aliases: ["pin", "pint"],
    version: "1.1.0",
    author: "nexo_here (Optimized)",
    countDown: 5,
    role: 0,
    description: "Search Pinterest and return the top 5 image results.",
    category: "image",
    guide: "{pn} [keyword] (e.g. {pn} Naruto)"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const query = args.join(" ");
    if (!query) {
      return api.sendMessage("⚠️ Please provide a search keyword.\nExample: pinterest Naruto", threadID, messageID);
    }

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const statusMsg = await new Promise((resolve) => {
      api.sendMessage(`🔍 Searching Pinterest for "\${query}"... Downloading top images... `, threadID, (err, info) => resolve(info), messageID);
    });

    const tempFiles = [];

    try {
      const count = 5;
      const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/pinterest?search=${encodeURIComponent(query)}&count=${count}`;
      const response = await axios.get(apiUrl, { timeout: 12000 });

      const imageList = response.data?.data;
      if (!Array.isArray(imageList) || imageList.length === 0) {
        if (statusMsg) try { await api.unsendMessage(statusMsg.messageID); } catch(e) {}
        return api.sendMessage("❌ No Pinterest results found for your search.", threadID, messageID);
      }

      const attachments = [];

      const downloadPromises = imageList.slice(0, 5).map(async (imageUrl, idx) => {
        try {
          const fileId = `pin_${event.senderID}_${Date.now()}_${idx}.jpg`;
          const imagePath = path.join(cacheDir, fileId);

          const imgResponse = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 10000 });
          await fs.writeFile(imagePath, imgResponse.data);

          attachments.push(fs.createReadStream(imagePath));
          tempFiles.push(imagePath);
        } catch (err) {
          console.warn(`Failed to download Pinterest image \${idx + 1}:`, err.message);
        }
      });

      await Promise.all(downloadPromises);

      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch(e) {}
      }

      if (attachments.length === 0) {
        return api.sendMessage("❌ Failed to download Pinterest images. Please try again.", threadID, messageID);
      }

      return api.sendMessage({
        body: `📌 Pinterest search results for: "\${query}"`,
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
      console.error("Pinterest command error:", err);
      if (statusMsg) {
        try { await api.unsendMessage(statusMsg.messageID); } catch(e) {}
      }
      for (const filePath of tempFiles) {
        try { await fs.remove(filePath); } catch (e) {}
      }
      return api.sendMessage("⚠️ Failed to search Pinterest or download assets. The API might be offline.", threadID, messageID);
    }
  }
};