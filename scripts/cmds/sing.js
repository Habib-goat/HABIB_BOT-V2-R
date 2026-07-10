const A = require("axios");
const B = require("fs-extra");
const C = require("path");
const S = require("yt-search");

const nix = "https://raw.githubusercontent.com/aryannix/stuffs/master/raw/apis.json";

module.exports = {
  config: {
    name: "sing",
    aliases: ["song", "music", "play"],
    version: "1.0.0",
    author: "ArYAN (Fixed)",
    countDown: 10,
    role: 0,
    category: "media"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID: t, messageID: m } = event;
    const q = args.join(" ");
    if (!q) {
      return api.sendMessage("❌ Please provide a song name or link.\nExample: sing Faded", t, m);
    }

    const cacheDir = C.join(__dirname, "cache");
    await B.ensureDir(cacheDir);

    const uniqueFileId = "sing_" + event.senderID + "_" + Date.now();
    const filePath = C.join(cacheDir, uniqueFileId + ".mp3");

    try {
      api.setMessageReaction("⏳", m, () => {}, true);
    } catch (e) {}

    try {
      let E;
      try {
        const D = await A.get(nix, { timeout: 8000 });
        E = D.data.api;
      } catch (err) {
        E = "https://api.nixhost.top/aryan";
      }

      let u = q;
      if (!q.startsWith("http")) {
        const r = await S(q);
        const v = r.videos[0];
        if (!v) {
          throw new Error("No YouTube video matches found for your query.");
        }
        u = v.url;
      }

      const F = await A.get(E + "/ytdl", {
        params: { url: u, type: "audio" },
        timeout: 30000
      });

      if (!F.data || !F.data.status || !F.data.downloadUrl) {
        throw new Error("YouTube conversion helper failed.");
      }

      const DL = F.data.downloadUrl;
      const title = F.data.title || "Song";

      const res = await A.get(DL, { responseType: "arraybuffer", timeout: 40000 });
      await B.outputFile(filePath, Buffer.from(res.data));

      try {
        api.setMessageReaction("✅", m, () => {}, true);
      } catch (e) {}

      return api.sendMessage({
        body: "🎵 Title: " + title,
        attachment: B.createReadStream(filePath)
      }, t, async () => {
        try {
          if (await B.pathExists(filePath)) {
            await B.remove(filePath);
          }
        } catch (cleanupErr) {}
      }, m);

    } catch (e) {
      try {
        api.setMessageReaction("❌", m, () => {}, true);
      } catch (err) {}
      try {
        if (await B.pathExists(filePath)) {
          await B.remove(filePath);
        }
      } catch (err) {}
      return api.sendMessage("❌ Error: " + (e.message || "An unknown error occurred."), t, m);
    }
  }
};
