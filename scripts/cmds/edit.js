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
  const res = await axiosClient.get(apiUrl);
  API_CACHE = res.data.apiv3;
  return API_CACHE;
}

async function urlToBase64(url) {
  const res = await axiosClient.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data).toString("base64");
}

module.exports = {
  config: {
    name: "edit",
    version: "1.2",
    author: "Saimx69x (Framework Fix)",
    countDown: 5,
    role: 0,
    shortDescription: "Edit image",
    longDescription: "Reply to an image.",
    category: "ai",
    guide: "{p}edit <prompt>"
  },

  onStart: async function ({ api, event, args }) {
    const repliedImage = event.messageReply?.attachments?.[0];
    const prompt = args.join(" ").trim();

    if (!repliedImage || repliedImage.type !== "photo") {
      return api.sendMessage("❌ Reply to an image.\nExample:\n/edit make it anime style", event.threadID, event.messageID);
    }

    if (!prompt) {
      return api.sendMessage("❌ Please provide an edit prompt.", event.threadID, event.messageID);
    }

    const waitMsg = await new Promise(resolve => {
      api.sendMessage("🎨 Editing image...\n⏳ Progress: 10%", event.threadID, (err, info) => resolve(info || {}), event.messageID);
    });

    const p1 = setTimeout(() => {
      if (waitMsg.messageID && api.editMessage) api.editMessage("🎨 Editing image...\n⏳ Progress: 40%", waitMsg.messageID);
    }, 3000);

    const p2 = setTimeout(() => {
      if (waitMsg.messageID && api.editMessage) api.editMessage("✨ Applying AI...\n⏳ Progress: 80%", waitMsg.messageID);
    }, 8000);

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    const imgPath = path.join(cacheDir, Date.now() + "_edit.jpg");

    try {
      const payload = {
        prompt: "Edit the given image based on this description:\n" + prompt,
        images: [await urlToBase64(repliedImage.url)],
        format: "jpg"
      };

      const res = await axiosClient.post(await getApiUrl(), payload, {
        responseType: "arraybuffer"
      });

      await fs.writeFile(imgPath, Buffer.from(res.data));

      clearTimeout(p1);
      clearTimeout(p2);

      if (waitMsg.messageID) {
        try { await api.unsendMessage(waitMsg.messageID); } catch(e){}
      }

      api.sendMessage({
        body: "✅ Image edited successfully!\n📝 Prompt: " + prompt,
        attachment: fs.createReadStream(imgPath)
      }, event.threadID, event.messageID);

    } catch (e) {
      clearTimeout(p1);
      clearTimeout(p2);
      if (waitMsg.messageID) {
        try { await api.unsendMessage(waitMsg.messageID); } catch(err){}
      }
      api.sendMessage("❌ Failed to edit image.\n" + (e.message || "Unknown error"), event.threadID, event.messageID);
    } finally {
      if (await fs.pathExists(imgPath)) await fs.remove(imgPath);
    }
  }
};
