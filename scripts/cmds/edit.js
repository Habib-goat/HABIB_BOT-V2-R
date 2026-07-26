const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const http = require("http");
const https = require("https");

const apiUrl = "https://raw.githubusercontent.com/Saim-x69x/sakura/main/ApiUrl.json";
let API_CACHE = null;

const client = axios.create({
  timeout: 60000, // reduced from 180s — fail fast and tell the user instead of hanging silently
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});

async function getApiUrl() {
  if (API_CACHE) return API_CACHE;
  const r = await client.get(apiUrl);
  if (!r.data?.apiv3) throw new Error("apiv3 key missing from ApiUrl.json");
  API_CACHE = r.data.apiv3;
  return API_CACHE;
}

async function urlToBase64(url) {
  const r = await client.get(url, { responseType: "arraybuffer" });
  return Buffer.from(r.data).toString("base64");
}

async function progress(api, msgId, p, t) {
  if (!api.editMessage || !msgId) return;
  const bars = {
    10: "▓░░░░░░░░░", 20: "▓▓░░░░░░░░", 30: "▓▓▓░░░░░░░", 40: "▓▓▓▓░░░░░░",
    50: "▓▓▓▓▓░░░░░", 60: "▓▓▓▓▓▓░░░░", 70: "▓▓▓▓▓▓▓░░░", 80: "▓▓▓▓▓▓▓▓░░",
    90: "▓▓▓▓▓▓▓▓▓░", 100: "▓▓▓▓▓▓▓▓▓▓"
  };
  try {
    await api.editMessage(`🖌️ Editing Image...\n\n${bars[p]} ${p}%\n${t}`, msgId);
  } catch (err) {
    // Previously silent — now logged so you can see in server logs if editMessage is failing
    console.error(`[edit] progress update (${p}%) failed:`, err.message);
  }
}

module.exports = {
  config: {
    name: "edit",
    version: "2.0.1",
    author: "Saimx69x + ChatGPT",
    countDown: 5,
    role: 0,
    shortDescription: "Edit image",
    longDescription: "Reply to an image",
    category: "ai",
    guide: "{p}edit <prompt>"
  },

  onStart: async function ({ api, event, args }) {
    const img = event.messageReply?.attachments?.[0];
    const prompt = args.join(" ").trim();

    if (!img || img.type !== "photo")
      return api.sendMessage("❌ Reply to an image first.", event.threadID, event.messageID);

    if (!prompt)
      return api.sendMessage("❌ Please provide a prompt.", event.threadID, event.messageID);

    let wait;
    try {
      wait = await new Promise((res, rej) => {
        api.sendMessage(
          "🖌️ Editing Image...\n\n▓░░░░░░░░░ 10%\n⏳ Initializing AI...",
          event.threadID,
          (e, i) => {
            if (e) return rej(e);
            res(i || {});
          },
          event.messageID
        );
      });
    } catch (err) {
      console.error("[edit] failed to send initial progress message:", err.message);
      return api.sendMessage("❌ Could not start image edit (failed to send status message).", event.threadID, event.messageID);
    }

    const id = wait.messageID;
    const timers = [
      setTimeout(() => progress(api, id, 20, "📥 Uploading image..."), 2000),
      setTimeout(() => progress(api, id, 30, "🧠 Analyzing image..."), 4000),
      setTimeout(() => progress(api, id, 40, "🎨 Applying changes..."), 6000),
      setTimeout(() => progress(api, id, 50, "✨ Enhancing details..."), 8000),
      setTimeout(() => progress(api, id, 60, "🪄 Rendering..."), 10000),
      setTimeout(() => progress(api, id, 70, "✨ Enhancing details..."), 12000),
      setTimeout(() => progress(api, id, 80, "🔍 Final touches..."), 14000),
      setTimeout(() => progress(api, id, 90, "📦 Preparing result..."), 16000)
    ];

    const cache = path.join(__dirname, "cache");
    await fs.ensureDir(cache);
    const out = path.join(cache, Date.now() + "_edit.jpg");

    try {
      console.log("[edit] fetching apiv3 base url...");
      const base = await getApiUrl();
      console.log("[edit] apiv3 =", base);

      const payload = {
        prompt: `Edit the given image based on this description:\n${prompt}`,
        images: [await urlToBase64(img.url)],
        format: "jpg"
      };

      console.log("[edit] sending request to apiv3...");
      const resp = await client.post(base, payload, { responseType: "arraybuffer" });
      console.log("[edit] apiv3 responded, bytes:", resp.data?.length);

      await progress(api, id, 100, "✅ Uploading image...");
      await fs.writeFile(out, Buffer.from(resp.data));
      timers.forEach(clearTimeout);
      if (id) try { await api.unsendMessage(id); } catch {}
      api.sendMessage({ body: `✅ Image edited successfully!\n📝 ${prompt}`, attachment: fs.createReadStream(out) }, event.threadID, event.messageID);

    } catch (e) {
      timers.forEach(clearTimeout);
      if (id) try { await api.unsendMessage(id); } catch {}

      // Log full detail server-side so you can see exactly what failed
      console.error("[edit] FAILED:", e.code || "", e.message, e?.response?.status || "");

      let reason = e.message || "Unknown error";
      if (e.code === "ECONNABORTED") reason = "The image API timed out (60s) — it may be cold-starting or offline. Try again in a minute.";
      else if (e.response?.status) reason = `Image API returned status ${e.response.status}.`;

      api.sendMessage(`❌ Failed to edit image.\n${reason}`, event.threadID, event.messageID);
    } finally {
      if (await fs.pathExists(out)) await fs.remove(out);
    }
  }
};
