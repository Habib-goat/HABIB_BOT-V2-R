const fs = require("fs");
const path = require("path");
const config = require("../../config.json");
const replyManager = require("../replies/replyManager");
const commandLoader = require("../handlers/commandLoader");

const CMDS_DIR = path.join(process.cwd(), "scripts", "cmds");

function isAuthorized(senderID) {
  const admins = [...(config.adminIDs || []), ...(config.ownerIDs || [])].map(String);
  return admins.includes(String(senderID));
}

function listDirEntries(relativePath) {
  const fullPath = path.join(CMDS_DIR, relativePath);
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
  return { dirs, files };
}

function renderListing(relativePath) {
  const { dirs, files } = listDirEntries(relativePath);
  const label = relativePath || "commands";

  let msg = `⚡️All files/folders in ${label}:\n\n`;
  msg += `🗂️ 『 ${label} 』\n`;

  const items = [];
  dirs.forEach((d) => items.push({ type: "dir", name: d }));
  files.forEach((f) => items.push({ type: "file", name: f }));

  items.forEach((item, idx) => {
    const icon = item.type === "dir" ? "📂" : "📄";
    msg += `├${idx + 1}. ${icon} ${item.name}\n`;
  });

  msg += "\n▭▭▭▭▭▭▭▭▭▭▭▭▭▭\n";
  msg += "✦Reply a number to open\n";
  msg += "✦Reply \"delete 1,2,3\" 🗑️ to delete\n";
  if (relativePath) msg += "✦Reply \"back\" 🔙 to go up\n";
  msg += "▭▭▭▭▭▭▭▭▭▭▭▭▭▭";

  return { msg, items };
}

module.exports = {
  config: {
    name: "file",
    aliases: ["filemanager", "fm"],
    version: "1.0.0",
    author: "Riyad",
    countDown: 3,
    role: 2,
    category: "system",
    guide: "{pn} — browse and manage command files (admin only)"
  },

  async onStart({ api, event }) {
    const threadID = event.threadID;
    const senderID = event.senderID;

    if (!isAuthorized(senderID)) {
      return api.sendMessage("❌ Only bot admins/owner can use this command.", threadID, event.messageID);
    }

    const { msg, items } = renderListing("");
    const sentMsg = await api.sendMessage(msg, threadID, event.messageID);
    const msgID = sentMsg?.messageID || sentMsg;

    if (msgID) {
      replyManager.register(msgID, {
        commandName: "file",
        type: "file_manager",
        relativePath: "",
        items,
        authorID: senderID
      });
    }
  },

  async onReply({ api, event, replyData }) {
    if (!replyData || replyData.type !== "file_manager") return;

    const threadID = event.threadID;
    const senderID = event.senderID;
    const body = (event.body || "").trim();

    if (!isAuthorized(senderID) || String(senderID) !== String(replyData.authorID)) {
      return api.sendMessage("❌ You are not authorized to use this file browser.", threadID, event.messageID);
    }

    if (body.toLowerCase() === "back") {
      const parentPath = path.dirname(replyData.relativePath || ".");
      const newPath = parentPath === "." ? "" : parentPath;
      const { msg, items } = renderListing(newPath);
      const sentMsg = await api.sendMessage(msg, threadID, event.messageID);
      const msgID = sentMsg?.messageID || sentMsg;
      if (msgID) replyManager.register(msgID, { ...replyData, relativePath: newPath, items });
      return;
    }

    const deleteMatch = body.match(/^delete\s+([\d,\s]+)$/i);
    if (deleteMatch) {
      const numbers = deleteMatch[1].split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
      const results = [];

      for (const num of numbers) {
        const item = replyData.items[num - 1];
        if (!item) {
          results.push(`#${num}: ❌ Not found`);
          continue;
        }
        if (item.type === "dir") {
          results.push(`#${num} (${item.name}): ❌ Cannot delete folders here`);
          continue;
        }
        try {
          const fullPath = path.join(CMDS_DIR, replyData.relativePath || "", item.name);
          fs.unlinkSync(fullPath);
          if (item.name.endsWith(".js")) {
            const cmdName = item.name.replace(/\.js$/, "");
            try { commandLoader.unloadCommand(cmdName); } catch (_) {}
          }
          results.push(`#${num} (${item.name}): ✅ Deleted`);
        } catch (err) {
          results.push(`#${num} (${item.name}): ❌ ${err.message}`);
        }
      }

      return api.sendMessage(`🗑️ [ DELETE RESULTS ]\n${results.join("\n")}`, threadID, event.messageID);
    }

    const num = parseInt(body, 10);
    if (!num || num < 1) {
      return api.sendMessage('⚠️ Reply with a valid number, "delete 1,2,3", or "back".', threadID, event.messageID);
    }

    const item = replyData.items[num - 1];
    if (!item) {
      return api.sendMessage("❌ Invalid number.", threadID, event.messageID);
    }

    const itemRelPath = replyData.relativePath ? `${replyData.relativePath}/${item.name}` : item.name;

    if (item.type === "dir") {
      const { msg, items } = renderListing(itemRelPath);
      const sentMsg = await api.sendMessage(msg, threadID, event.messageID);
      const msgID = sentMsg?.messageID || sentMsg;
      if (msgID) replyManager.register(msgID, { ...replyData, relativePath: itemRelPath, items });
      return;
    }

    try {
      const fullPath = path.join(CMDS_DIR, itemRelPath);
      const content = fs.readFileSync(fullPath, "utf8");
      const MAX_LEN = 15000;
      const truncated = content.length > MAX_LEN;
      const shown = truncated ? content.slice(0, MAX_LEN) : content;

      const header = `📄 ${itemRelPath}${truncated ? ` (truncated, showing first ${MAX_LEN} chars)` : ""}\n\`\`\`js\n`;
      const footer = "\n```";

      await api.sendMessage(header + shown + footer, threadID, event.messageID);
    } catch (err) {
      await api.sendMessage(`❌ Failed to read file: ${err.message}`, threadID, event.messageID);
    }
  }
};
