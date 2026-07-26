const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// Renz API list (hosted JSON, fetched fresh each call)
const NC_API_LIST = "https://raw.githubusercontent.com/noobcore404/NC-STORE/main/NCApiUrl.json";

async function getRenzApi() {
  const res = await axios.get(NC_API_LIST, { timeout: 10000 });
  if (!res.data?.renz) throw new Error("Renz API base URL not found in NC-STORE JSON");
  return res.data.renz;
}

module.exports = {
  config: {
    name: "gptimage",
    aliases: ["nanobanana", "imggen"],
    version: "1.0.0",
    author: "rX x AKASH",
    countDown: 5,
    role: 0,
    category: "image",
    shortDescription: "Generate or edit images from a text prompt.",
    longDescription: "Generates a new image from a text prompt, or edits a replied-to image using your prompt as instructions.",
    guide: "{pn} <prompt>  |  or reply to an image with {pn} <prompt>"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, messageReply } = event;
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return api.sendMessage(
        "❌ Please provide a prompt.\n\nExamples:\n/gptimage a cyberpunk city\n/gptimage make me anime (reply to an image)",
        threadID,
        messageID
      );
    }

    const loadingMsg = await api.sendMessage("⏳ Processing your image...", threadID);

    const cacheDir = path.join(__dirname, "cache");
    await fs.ensureDir(cacheDir);
    const imgPath = path.join(cacheDir, `${Date.now()}_gptimage.png`);

    try {
      const BASE_URL = await getRenzApi();
      let apiURL = `${BASE_URL}/api/gptimage?prompt=${encodeURIComponent(prompt)}`;

      const repliedImage = messageReply?.attachments?.[0];
      if (repliedImage?.type === "photo") {
        apiURL += `&ref=${encodeURIComponent(repliedImage.url)}`;
        if (repliedImage.width && repliedImage.height) {
          apiURL += `&width=${repliedImage.width}&height=${repliedImage.height}`;
        }
      } else {
        apiURL += `&width=512&height=512`;
      }

      const res = await axios.get(apiURL, {
        responseType: "arraybuffer",
        timeout: 180000
      });

      await fs.writeFile(imgPath, res.data);

      if (loadingMsg?.messageID) {
        await api.unsendMessage(loadingMsg.messageID).catch(() => {});
      }

      await api.sendMessage(
        {
          body: repliedImage
            ? `🖌 Image edited successfully.\nPrompt: ${prompt}`
            : `🖼 Image generated successfully.\nPrompt: ${prompt}`,
          attachment: fs.createReadStream(imgPath)
        },
        threadID,
        () => fs.unlink(imgPath).catch(() => {})
      );

    } catch (err) {
      console.error("GPTIMAGE Error:", err?.response?.data || err.message);
      if (loadingMsg?.messageID) {
        await api.unsendMessage(loadingMsg.messageID).catch(() => {});
      }
      await fs.remove(imgPath).catch(() => {});
      api.sendMessage("❌ Failed to process image. Please try again later.", threadID, messageID);
    }
  }
};
