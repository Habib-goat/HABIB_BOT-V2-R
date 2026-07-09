const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const http = require("http");
const https = require("https");

const apiUrl = "https://raw.githubusercontent.com/Saim-x69x/sakura/main/ApiUrl.json";
let API_CACHE = null;

const axiosClient = axios.create({
  timeout: 180000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});

async function getApiUrl() {
  if (API_CACHE) return API_CACHE;

  const res = await axiosClient.get(apiUrl, { timeout: 10000 });
  API_CACHE = res.data.apiv3;
  return API_CACHE;
}

async function urlToBase64(url) {
  const res = await axiosClient.get(url, {
    responseType: "arraybuffer",
    timeout: 30000
  });
  return Buffer.from(res.data).toString("base64");
}

module.exports = {
  config: {
    name: "edit",
    version: "1.1",
    author: "Saimx69x (Optimized by ChatGPT)",
    countDown: 5,
    role: 0,
    shortDescription: "Edit an image using AI",
    longDescription: "Reply to an image and provide a prompt.",
    category: "ai",
    guide: "{p}edit <prompt> (reply to an image)"
  },

  onStart: async function ({ api, event, args, message }) {
    const repliedImage = event.messageReply?.attachments?.[0];
    const prompt = args.join(" ").trim();

    if (!repliedImage || repliedImage.type !== "photo")
      return message.reply("❌ Reply to an image.\nExample:\n/edit make it anime style");

    if (!prompt)
      return message.reply("❌ Please provide an edit prompt.");

    const waitMsg = await message.reply("🎨 Editing your image...");

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);

    const imgPath = path.join(cacheDir, `${Date.now()}_edit.jpg`);

    try {
      const API_URL = await getApiUrl();

      const payload = {
        prompt: `Edit the given image based on this description:\n${prompt}`,
        images: [await urlToBase64(repliedImage.url)],
        format: "jpg"
      };

      const res = await axiosClient.post(API_URL, payload, {
        responseType: "arraybuffer"
      });

      await fs.writeFile(imgPath, Buffer.from(res.data));

      if (waitMsg?.messageID) {
        await api.unsendMessage(waitMsg.messageID).catch(() => {});
      }

      return message.reply({
        body: `✅ Image edited successfully!\n📝 Prompt: ${prompt}`,
        attachment: fs.createReadStream(imgPath)
      });

    } catch (err) {
      console.error("EDIT ERROR:", err.response?.data || err.message);

      if (waitMsg?.messageID) {
        await api.unsendMessage(waitMsg.messageID).catch(() => {});
      }

      return message.reply("❌ Image edit failed. Please try again later.");
    } finally {
      if (await fs.pathExists(imgPath)) {
        await fs.remove(imgPath);
      }
    }
  }
};
