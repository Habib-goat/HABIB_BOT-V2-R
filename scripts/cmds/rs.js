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
         `〔🛍️ 𝗥𝗜𝗬𝗔𝗗-𝗦𝗧𝗢𝗥𝗘 🛍️ 〕\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• /rs list [page]      : Paginated command list\n` +
        `• /rs search <query>  : Fast search (ID / Name)\n` +
        `• /rs info <id|name>   : Command details card\n` +
        `• /rs install <id>     : Install with animated progress\n` +
        `• /rs update <id>      : Safe update with backup\n` +
        `• /rs featured         : Top trending commands\n` +
        `• /rs sync             : Sync local files with store\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 Base API: https://riyad-store-api.onrender.com`
      );
      return await send(menu);
    }

    // --- 2. LIST ---
    if (subCommand === "list" || subCommand === "ls") {
      const page = Math.max(1, parseInt(args[1], 10) || 1);
      const limit = 5;

      try {
        const data = await StoreAPI.listCommands(page, limit);

const commands = data.data || [];

if (commands.length === 0) {
  return await send("❌ No commands found on Riyad Store.");
}

const totalPages = data.meta?.totalPages || 1;
const total = data.meta?.total || commands.length;

const card = ProgressUI.renderPaginatedList(
  commands,
  page,
  totalPages,
  total
);

return await send(card);
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
      const syncMsg = await send("🔄 [ RIYAD STORE ] Syncing local commands with Store API...");
      try {
        const res = await StoreSync.syncAll();
        const msg = (
          `✅ [ STORE AUTO-SYNC COMPLETE ]\n` +
          `╭─────────────◊\n` +
          `├‣ Auto-Uploaded : ${res.syncedCount} new file(s)\n` +
          `├‣ Already Synced: ${res.skippedCount} file(s)\n` +
          `╰─────────────◊\n` +
          `💡 Local command hashes verified.`
        );
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
  }
};
