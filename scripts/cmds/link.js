
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

module.exports = {
  config: {
    name: "link",
    aliases: ["upload","0x0","0x0st"],
    version: "1.0.0",
    author: "ChatGPT",
    role: 0,
    category: "media",
    guide: "{pn} (reply to an attachment)"
  },

  onStart: async function ({ api, event }) {
    const { threadID, messageID, messageReply } = event;

    if (!messageReply || !messageReply.attachments || !messageReply.attachments.length)
      return api.sendMessage("Reply to an image, video, audio or file.", threadID, messageID);

    const att = messageReply.attachments[0];
    const cache = path.join(__dirname, "cache");
    if (!fs.existsSync(cache)) fs.mkdirSync(cache, { recursive: true });

    const ext = path.extname(att.filename || "") || ".bin";
    const file = path.join(cache, `link_${Date.now()}${ext}`);

    try {
      const res = await axios({ url: att.url, method: "GET", responseType: "stream", timeout: 30000 });

      await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(file);
        res.data.pipe(w);
        w.on("finish", resolve);
        w.on("error", reject);
      });

      const form = new FormData();
      form.append("file", fs.createReadStream(file));

      const up = await axios.post("https://0x0.st", form, {
        headers: form.getHeaders(),
        timeout: 60000,
        maxBodyLength: Infinity
      });

      const link = String(up.data).trim();
      if (!link.startsWith("https://0x0.st/"))
        throw new Error("Invalid upload response: " + link);

      api.sendMessage("☁️ Upload Success!\\n\\n🔗 Direct Link:\\n" + link, threadID, messageID);
    } catch (e) {
      api.sendMessage("❌ Upload Failed\\n\\n" + (e.message || "Unknown error"), threadID, messageID);
    } finally {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
    }
  }
};
