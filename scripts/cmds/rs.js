const path = require("path");
const fs = require("fs");
const StoreAPI = require("../services/StoreAPI");
const ProgressUI = require("../services/ProgressUI");
const StoreValidator = require("../services/StoreValidator");
const StoreLoader = require("../services/StoreLoader");
const StoreSync = require("../services/StoreSync");
const FileWatcher = require("../services/FileWatcher");
const { atomicWriteFile } = require("../utils/atomicWrite");
const { parseCommandMetadata } = require("../utils/parser");
const replyManager = require("../replies/replyManager");
const reactionManager = require("../reactions/reactionManager");

// Shared helper: sends one page of the store list and registers
// reaction (❤️/💝 = next page) + reply (number = jump to page) listeners
async function sendListPage(api, threadID, page, limit, previousMessageID = null) {
  const send = (msg) => api.sendMessage(msg, threadID);

  const data = await StoreAPI.listCommands(page, limit);
  const commands = data.commands || [];

  if (commands.length === 0) {
    return await send(page > 1 ? "❌ No more pages." : "❌ No commands found on Riyad Store.");
  }

  const totalPages = data.totalPages || 1;
  const total = data.total || commands.length;

  const card = ProgressUI.renderPaginatedList(commands, page, totalPages, total);
  const footer = "\n\n❤️ React ❤️ or 💝 on this message for the next page\n💬 Or reply with a page number to jump there";

  const sentMsg = await send(card + footer);
  const msgID = sentMsg?.messageID || sentMsg;

  if (msgID) {
    const regData = { commandName: "rs", type: "list_pagination", page, limit, totalPages };
    reactionManager.register(msgID, regData);
    replyManager.register(msgID, regData);
  }

  // Auto-unsend the previous page's message once the new page is up
  if (previousMessageID && typeof api.unsendMessage === "function") {
    try {
      await api.unsendMessage(previousMessageID);
    } catch (err) {
      logger.error("Failed to unsend previous page message:", err);
    }
    reactionManager.delete(previousMessageID);
    replyManager.delete(previousMessageID);
  }

  return sentMsg;
}

// Ensure FileWatcher is initialized as a singleton
if (!FileWatcher.isWatching) {
  try {
    FileWatcher.start();
  } catch (_) {}
}

/**
 * Sanitizes command filename to prevent directory traversal or invalid characters.
 * @param {string} name 
 * @returns {string} Clean filename base
 */
function sanitizeName(name) {
  if (!name || typeof name !== "string") return "command";
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
}

module.exports = {
  config: {
    name: "rs",
    aliases: ["riyadstore", "store"],
    version: "2.1.0",
    author: "Riyad",
    countDown: 3,
    role: 0,
    shortDescription: "Riyad Store - Production Command System",
    longDescription: "High-performance command manager for Riyad Store. Browse, search, install, update, and auto-sync commands.",
    category: "system",
    guide: "{pn} [list | search <query> | install <id> | update <id> | info <id> | featured | sync]"
  },

  async onStart({ api, event, args, usersData, threadsData, commandLoader }) {
    const threadID = event?.threadID;
    if (!threadID) return;

    const subCommand = (args[0] || "").toLowerCase().trim();

    // Helper for sending messages safely
    const send = (msg) => {
  return api.sendMessage(msg, threadID, event.messageID);
};

    // Helper for editing messages safely with fallback
    const edit = async (msg, messageID) => {
  if (messageID && typeof api.editMessage === "function") {
    try {
      return await api.editMessage(msg, messageID);
    } catch {}
  }

  return api.sendMessage(msg, threadID, event.messageID);
};

    // --- 1. HELP / MENU ---
    if (!subCommand) {
      const menu = (
  `✦━━『 🛍️𝗥𝗜𝗬𝗔𝗗-𝗦𝗧𝗢𝗥𝗘 』━━✦\n` +
  `\n` +
  `╭─【📦 𝗖𝗢𝗠𝗠𝗔𝗡𝗗】\n` +
  `├❖ /rs list [page]\n` +
  `├❖ /rs search <query>\n` +
  `├❖ /rs info <id|name>\n` +
  `├❖ /rs install <id>\n` +
  `├❖ /rs update <id>\n` +
  `├❖ /rs featured\n` +
  `├❖ /rs sync\n` +
  `╰───────────────\n` +
  `\n` +
  `╭─【 🌐 𝗕𝗔𝗦𝗘 𝗔𝗣𝗜 】\n` +
  `├❖ https://riyad-store-api.onrender.com\n` +
  `╰───────────────`
);
      return await send(menu);
    }

    // --- 2. LIST ---
    if (subCommand === "list" || subCommand === "ls") {
      const page = Math.max(1, parseInt(args[1], 10) || 1);
      const limit = 5;

      try {
        return await sendListPage(api, threadID, page, limit);
      } catch (err) {
        return await send(`❌ Failed to fetch list: ${err.message}`);
      }
    }

    // --- 3. SEARCH ---
    if (subCommand === "search" || subCommand === "find") {
      const query = args.slice(1).join(" ").trim();
      if (!query) {
        return await send("⚠️ Please provide a keyword or ID to search. Example: /rs search music");
      }

      if (query.toLowerCase() === "list") {
        const data = await StoreAPI.listCommands(1, 20);
        const commands = data.commands || [];
        if (commands.length === 0) {
          return await send("❌ No commands found on Riyad Store.");
        }
        const card = ProgressUI.renderPaginatedList(commands, 1, data.totalPages || 1, data.total || commands.length);
        return await send(card);
      }

      try {
        const data = await StoreAPI.searchCommands(query);
        const results = data.commands || (Array.isArray(data) ? data : []);

        if (results.length === 0) {
          return await send(`❌ No commands matching "${query}" were found on Riyad Store.`);
        }

        if (results.length === 1) {
          return await send(ProgressUI.renderCommandInfo(results[0]));
        }

        const card = ProgressUI.renderPaginatedList(results.slice(0, 5), 1, 1, results.length);
        return await send(`🔍 Search results for "${query}":\n\n` + card);
      } catch (err) {
        return await send(`❌ Search failed: ${err.message}`);
      }
    }

    // --- 4. COMMAND INFO ---
    if (subCommand === "info" || subCommand === "view") {
      const target = (args[1] || args.slice(1).join(" ")).trim();
      if (!target) {
        return await send("⚠️ Please specify command ID or name. Example: /rs info 12");
      }

      try {
        const info = await StoreAPI.getCommandDetails(target);
        if (!info || !info.name) {
          return await send(`❌ Command "${target}" not found on Riyad Store.`);
        }

        const card = ProgressUI.renderCommandInfo(info);
        return await send(card);
      } catch (err) {
        return await send(`❌ Could not retrieve command info: ${err.message}`);
      }
    }

    // --- 5. FEATURED / TRENDING ---
    if (subCommand === "featured" || subCommand === "trending" || subCommand === "top") {
      try {
        const list = await StoreAPI.getFeatured();
        if (!list || list.length === 0) {
          return await send("❌ No featured commands available right now.");
        }

        const card = ProgressUI.renderFeaturedList(list.slice(0, 5));
        return await send(card);
      } catch (err) {
        return await send(`❌ Failed to load featured list: ${err.message}`);
      }
    }

    // --- 6. INSTALL ---
    if (subCommand === "install" || subCommand === "i") {
      const target = (args[1] || "").trim();
      if (!target) {
        return await send("⚠️ Usage: /rs install <id or name>");
      }

      let details;
      try {
        details = await StoreAPI.getCommandDetails(target);
      } catch (_) {}

      const commandName = sanitizeName(details?.name || target);
      const targetFileName = `${commandName}.js`;
      const targetPath = path.join(process.cwd(), "scripts", "cmds", targetFileName);

      // DUPLICATE CHECK BEFORE INSTALLATION
      if (fs.existsSync(targetPath)) {
        const errorCard = ProgressUI.renderFileExistsCard(commandName, `scripts/cmds/${targetFileName}`);
        return await send(errorCard);
      }

      // Progress setup
      let progressMsg = await send(ProgressUI.renderInstallProgress(commandName, "Fetching package", 10, 0));
      const msgID = progressMsg?.messageID || progressMsg;

      const steps = [
        { name: "Downloading source", pct: 25 },
        { name: "Validating syntax", pct: 45 },
        { name: "Checking duplicate status", pct: 65 },
        { name: "Writing file atomically", pct: 85 },
        { name: "Loading command into framework", pct: 95 }
      ];

      try {
        // Step 1: Download code
        await edit(ProgressUI.renderInstallProgress(commandName, steps[0].name, steps[0].pct, 1), msgID);
        let rawCode = details?.rawCode;
        if (!rawCode) {
          rawCode = await StoreAPI.downloadCommandRaw(target);
        }

        if (!rawCode || typeof rawCode !== "string") {
          return await edit("❌ Installation Failed: Empty or invalid source code received.", msgID);
        }

        // Step 2: Validate code
        await edit(ProgressUI.renderInstallProgress(commandName, steps[1].name, steps[1].pct, 2), msgID);
        const val = StoreValidator.validate(rawCode);
        if (!val.valid) {
          return await edit(`❌ Installation Aborted: ${val.error}`, msgID);
        }

        // Step 3: Double check duplicate
        await edit(ProgressUI.renderInstallProgress(commandName, steps[2].name, steps[2].pct, 3), msgID);
        if (fs.existsSync(targetPath)) {
          return await edit(ProgressUI.renderFileExistsCard(commandName, `scripts/cmds/${targetFileName}`), msgID);
        }

        // Step 4: Atomic file write
        await edit(ProgressUI.renderInstallProgress(commandName, steps[3].name, steps[3].pct, 4), msgID);
        await atomicWriteFile(targetPath, rawCode);

        // Step 5: Load command
        await edit(ProgressUI.renderInstallProgress(commandName, steps[4].name, steps[4].pct, 5), msgID);
        const loadRes = await StoreLoader.loadOrReload(targetPath, commandLoader);

        // Step 6: Complete Success Card
        const meta = parseCommandMetadata(rawCode) || {};
        const successCard = ProgressUI.renderSuccessCard({
          name: meta.name || commandName,
          version: meta.version || details?.version || "1.0.0",
          author: meta.author || details?.author || "Unknown",
          category: meta.category || details?.category || "General",
          id: details?.id || target,
          filePath: `scripts/cmds/${targetFileName}`,
          autoloadStatus: loadRes.success ? `"${commandName}" loaded and live!` : `Load notice: ${loadRes.error}`
        });

        return await edit(successCard, msgID);
      } catch (err) {
        return await edit(`❌ Installation Failed: ${err.message}`, msgID);
      }
    }
// --- 6.5 UNINSTALL ---
    if (subCommand === "uninstall" || subCommand === "remove") {
      const target = (args[1] || "").trim();
      if (!target) {
        return await send("⚠️ Usage: /rs uninstall <command name>");
      }

      const commandName = sanitizeName(target);
      const targetFileName = `${commandName}.js`;
      const targetPath = path.join(process.cwd(), "scripts", "cmds", targetFileName);

      if (!fs.existsSync(targetPath)) {
        return await send(`❌ "${commandName}" is not installed locally (file not found).`);
      }

      try {
        if (commandLoader?.unloadCommand) {
  commandLoader.unloadCommand(commandName);
}
        fs.unlinkSync(targetPath);

        return await send(
          `✅ [ COMMAND UNINSTALLED ]\n` +
          `╭─────────────◊\n` +
          `├‣ Command  : ${commandName}\n` +
          `├‣ Removed  : scripts/cmds/${targetFileName}\n` +
          `╰─────────────◊\n` +
          `🗑️ Unloaded from live memory and deleted from disk.`
        );
      } catch (err) {
        return await send(`❌ Uninstall Failed: ${err.message}`);
      }
    }
    // --- 7. UPDATE ---
    if (subCommand === "update" || subCommand === "u") {
      const target = (args[1] || "").trim();
      if (!target) {
        return await send("⚠️ Usage: /rs update <id or name>");
      }

      let details;
      try {
        details = await StoreAPI.getCommandDetails(target);
      } catch (_) {}

      const commandName = sanitizeName(details?.name || target);
      const targetFileName = `${commandName}.js`;
      const targetPath = path.join(process.cwd(), "scripts", "cmds", targetFileName);
      const backupPath = path.join(process.cwd(), "scripts", "cmds", `${targetFileName}.bak`);

      let progressMsg = await send(ProgressUI.renderUpdateProgress(commandName, "Fetching update package", 15, 0));
      const msgID = progressMsg?.messageID || progressMsg;

      try {
        // Step 1: Backup old file if exists
        if (fs.existsSync(targetPath)) {
          fs.copyFileSync(targetPath, backupPath);
        }

        // Step 2: Download new code
        await edit(ProgressUI.renderUpdateProgress(commandName, "Downloading latest code", 35, 1), msgID);
        let rawCode = details?.rawCode;
        if (!rawCode) {
          rawCode = await StoreAPI.downloadCommandRaw(target);
        }

        if (!rawCode || typeof rawCode !== "string") {
          return await edit("❌ Update Failed: Invalid code received from store.", msgID);
        }

        // Step 3: Validate code
        await edit(ProgressUI.renderUpdateProgress(commandName, "Validating code syntax", 60, 2), msgID);
        const val = StoreValidator.validate(rawCode);
        if (!val.valid) {
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, targetPath);
            fs.unlinkSync(backupPath);
          }
          return await edit(`❌ Update Failed: ${val.error}. Previous version restored.`, msgID);
        }

        // Step 4: Atomic write replacement
        await edit(ProgressUI.renderUpdateProgress(commandName, "Replacing command file", 80, 3), msgID);
        await atomicWriteFile(targetPath, rawCode);

        // Remove backup after safe write
        if (fs.existsSync(backupPath)) {
          try { fs.unlinkSync(backupPath); } catch (_) {}
        }

        // Step 5: Reload command automatically
        await edit(ProgressUI.renderUpdateProgress(commandName, "Reloading command module", 95, 4), msgID);
        const loadRes = await StoreLoader.loadOrReload(targetPath, commandLoader);

        const meta = parseCommandMetadata(rawCode) || {};
        const successCard = (
          `✅ [ COMMAND UPDATED SUCCESSFULLY ]\n` +
          `╭─────────────◊\n` +
          `├‣ Command  : ${meta.name || commandName}\n` +
          `├‣ Version  : v${meta.version || details?.version || "1.0.0"}\n` +
          `├‣ Location : scripts/cmds/${targetFileName}\n` +
          `╰─────────────◊\n` +
          `🔄 Auto-reload: ${loadRes.success ? "Success!" : loadRes.error}`
        );

        return await edit(successCard, msgID);
      } catch (err) {
        if (fs.existsSync(backupPath)) {
          try {
            fs.copyFileSync(backupPath, targetPath);
            fs.unlinkSync(backupPath);
          } catch (_) {}
        }
        return await edit(`❌ Update Error: ${err.message}`, msgID);
      }
    }

    // --- 8. MANUAL SYNC ---
    if (subCommand === "sync") {
      const syncMsg = await send(
`📦 Syncing with Riyad Store...

🔄 Checking...
📤 Uploading...`
);
      try {
        const res = await StoreSync.syncAll();
        const msg =
  `✅ [ STORE AUTO-SYNC COMPLETE ]\n` +
  `╭─────────────◊\n` +
  `├‣ Auto-Uploaded : ${res.syncedCount} new file(s)\n` +
  `├‣ Already Synced: ${res.skippedCount} file(s)\n` +
  `╰─────────────◊\n` +
  `💡 Local command hashes verified.`;

if (res.failedFiles && res.failedFiles.length > 0) {
  const failList = res.failedFiles
    .map(f => `• ${f.file}: ${f.reason}`)
    .join("\n");

  await send(
    `⚠️ [ SYNC WARNINGS - ${res.failedFiles.length} file(s) skipped ]\n${failList}`
  );
}

        return await edit(msg, syncMsg?.messageID || syncMsg);
      } catch (err) {
        return await edit(`❌ Sync Error: ${err.message}`, syncMsg?.messageID || syncMsg);
      }
    }

    // --- 9. DIRECT LOOKUP BY ID / NAME (/rs <id> or /rs <name>) ---
    try {
      const info = await StoreAPI.getCommandDetails(subCommand);
      if (info && info.name) {
        return await send(ProgressUI.renderCommandInfo(info));
      }
    } catch (_) {}

    return await send("⚠️ Unknown subcommand or command not found. Type `/rs` for menu.");
  },

  async onReaction({ api, event, reactionData }) {
    if (!reactionData || reactionData.type !== "list_pagination") return;

    const reaction = event.reaction;
    if (reaction !== "❤️" && reaction !== "💝") return;

    const nextPage = (reactionData.page || 1) + 1;
    await sendListPage(api, event.threadID, nextPage, reactionData.limit || 5, event.messageID);
  },

  async onReply({ api, event, replyData }) {
    if (!replyData || replyData.type !== "list_pagination") return;

    const requestedPage = parseInt((event.body || "").trim(), 10);
    if (!requestedPage || requestedPage < 1) {
      return await api.sendMessage("⚠️ Please reply with a valid page number.", event.threadID, event.messageID);
    }

    await sendListPage(api, event.threadID, requestedPage, replyData.limit || 5, event.messageID);
  }
};
