const path = require("path");
const fs = require("fs");
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

module.exports = {
  config: {
    name: "codeinstalllistener",
    version: "1.0.0",
    author: "Riyad",
    role: 2,
    category: "system",
    shortDescription: "Listens for reply-based install/upload of pasted code"
  },

  async onStart() {
    // No direct command, this only works via onChat below
  },

  async onChat({ api, event }) {
    if (event.type !== "message_reply") return;

    const repliedBody = event.messageReply && event.messageReply.body;
    if (!repliedBody || typeof repliedBody !== "string") return;

    const action = (event.body || "").trim().toLowerCase();
    if (action !== "install" && action !== "upload") return;

    const send = (msg) => api.sendMessage(msg, event.threadID, event.messageID);

    const val = StoreValidator.validate(repliedBody);
    if (!val.valid) {
      return send(`❌ Cannot process code: ${val.error}`);
    }

    const meta = parseCommandMetadata(repliedBody);
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
        await atomicWriteFile(targetPath, repliedBody);
        const loadRes = await StoreLoader.loadOrReload(targetPath, commandLoader);

        return send(
          `✅ [ COMMAND INSTALLED FROM PASTE ]\n` +
          `├‣ Command : ${commandName}\n` +
          `├‣ Location: scripts/cmds/${targetFileName}\n` +
          `╰‣ Load    : ${loadRes.success ? "Loaded and live!" : `Notice: ${loadRes.error}`}`
        );
      } catch (err) {
        return send(`❌ Install Failed: ${err.message}`);
      }
    }

    if (action === "upload") {
      try {
        const res = await StoreUploader.upload(repliedBody, `${commandName}.js`);
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
