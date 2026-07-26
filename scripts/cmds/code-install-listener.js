const path = require("path");
const fs = require("fs");
const axios = require("axios");
const StoreValidator = require("../services/StoreValidator");
const StoreUploader = require("../services/StoreUploader");
const StoreLoader = require("../services/StoreLoader");
const commandLoader = require("../handlers/commandLoader");
const { atomicWriteFile } = require("../utils/atomicWrite");
const { parseCommandMetadata } = require("../utils/parser");

function sanitizeName(name) {
  if (!name || typeof name !== "string") return "command";
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

async function resolveCodeContent(repliedBody) {
  const url = extractUrl(repliedBody.trim());
  if (!url) {
    // Not a link — treat the whole message as raw pasted code
    return repliedBody;
  }

  // It's a link — fetch the actual code from it
  const res = await axios.get(url, { timeout: 15000, responseType: "text" });
  if (typeof res.data !== "string") {
    throw new Error("Link did not return plain code text.");
  }
  return res.data;
}

module.exports = {
  config: {
    name: "codeinstalllistener",
    version: "1.0.0",
    author: "Riyad",
    role: 0,
    category: "system",
    shortDescription: "Listens for reply-based install/upload of pasted code or store links"
  },

  async onStart() {
    // No direct command — this only works via onChat below
  },

  async onChat({ api, event }) {
    if (event.type !== "message_reply") return;

    const repliedBody = event.messageReply && event.messageReply.body;
    if (!repliedBody || typeof repliedBody !== "string") return;

    const action = (event.body || "").trim().toLowerCase();
    if (action !== "install" && action !== "upload") return;

    const send = (msg) => api.sendMessage(msg, event.threadID, event.messageID);

    let codeContent;
    try {
      codeContent = await resolveCodeContent(repliedBody);
    } catch (err) {
      return send(`❌ Could not fetch code from the link: ${err.message}`);
    }

    const val = StoreValidator.validate(codeContent);
    if (!val.valid) {
      return send(`❌ Cannot process code: ${val.error}`);
    }

    const meta = parseCommandMetadata(codeContent);
    if (!meta || !meta.name) {
      return send("❌ Could not find a valid command name (config.name) in the code.");
    }

    const commandName = sanitizeName(meta.name);

    if (action === "install") {
      const targetFileName = `${commandName}.js`;
      const targetPath = path.join(process.cwd(), "scripts", "cmds", targetFileName);

      if (fs.existsSync(targetPath)) {
        return send(`❌ "${commandName}" already exists locally. Uninstall it first (/rs uninstall ${commandName}) to replace it.`);
      }

      try {
        await atomicWriteFile(targetPath, codeContent);
        const loadRes = await StoreLoader.loadOrReload(targetPath, commandLoader);

        return send(
          `✅ [ COMMAND INSTALLED ]\n` +
          `├‣ Command : ${commandName}\n` +
          `├‣ Source  : ${extractUrl(repliedBody) ? "Store link" : "Pasted code"}\n` +
          `├‣ Location: scripts/cmds/${targetFileName}\n` +
          `╰‣ Load    : ${loadRes.success ? "Loaded and live!" : `Notice: ${loadRes.error}`}`
        );
      } catch (err) {
        return send(`❌ Install Failed: ${err.message}`);
      }
    }

    if (action === "upload") {
      try {
        const res = await StoreUploader.upload(codeContent, `${commandName}.js`);
        if (!res.success) {
          return send(`❌ Upload Failed: ${res.error}`);
        }
        return send(
          `✅ [ UPLOADED TO STORE ]\n` +
          `├‣ Command : ${commandName}\n` +
          `╰‣ Now available via /rs install ${commandName}`
        );
      } catch (err) {
        return send(`❌ Upload Failed: ${err.message}`);
      }
    }
  }
};
