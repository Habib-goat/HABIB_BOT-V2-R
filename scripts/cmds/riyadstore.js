/**
 * ============================================================================
 * RS.JS — Riyad Store Command for Facebook Messenger Bot Framework
 * ============================================================================
 * Architecture : Modular, Event-Driven, Fail-Safe Async Flow
 * Version      : 2.0.0 (Production Ready)
 * Framework    : Custom Messenger Bot Framework
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const vm = require("vm");

// ----------------------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// ----------------------------------------------------------------------------
const STORE_API_BASE = "https://riyad-store-api.onrender.com";
const DEFAULT_TIMEOUT = 10000; // 10 Seconds Timeout
const MAX_RETRIES = 3;

// Default Directory relative to Bot Root CWD
const COMMANDS_DIR = path.join(process.cwd(), "scripts", "cmds");
const EVENTS_DIR = path.join(process.cwd(), "scripts", "events");

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS: UI & ANIMATION
// ----------------------------------------------------------------------------

/**
 * Builds an animated progress card matching the requested store theme
 */
function buildProgressCard(title, percent, statusText, details = "") {
  const totalBlocks = 10;
  const filled = Math.min(totalBlocks, Math.max(0, Math.floor((percent / 100) * totalBlocks)));
  const empty = totalBlocks - filled;
  const progressBar = "█".repeat(filled) + "░".repeat(empty);

  let card = `╭────────────────────╮\n`;
  card += `│ 📦 Riyad Store\n`;
  card += `├────────────────────┤\n`;
  card += `│ ${title}\n`;
  card += `│ [${progressBar}] ${percent}%\n`;
  card += `│ ‣ ${statusText}\n`;
  if (details) {
    card += `│ ℹ️ ${details}\n`;
  }
  card += `╰────────────────────╯`;
  return card;
}

/**
 * Helper to safely reply or send messages to thread
 */
async function sendReply(api, threadID, text, messageID = null) {
  try {
    if (typeof api.reply === "function") {
      const res = await api.reply(text);
      if (res && res.messageID) return res.messageID;
      if (res && typeof res === "object" && res.message_id) return res.message_id;
    }
  } catch (_) {}

  try {
    if (typeof api.sendMessage === "function") {
      const res = await api.sendMessage(text, threadID, messageID);
      if (res && res.messageID) return res.messageID;
    }
  } catch (_) {}

  return null;
}

/**
 * Helper to edit messages for animated progress
 */
async function editProgress(api, text, messageID) {
  if (!messageID) return;
  try {
    if (typeof api.editMessage === "function") {
      await api.editMessage(text, messageID);
    }
  } catch (_) {
    // Ignore edits if message was deleted or uneditable
  }
}

/**
 * React to user message if supported
 */
async function setReaction(api, emoji, messageID) {
  if (!messageID) return;
  try {
    if (typeof api.react === "function") {
      await api.react(emoji, messageID);
    }
  } catch (_) {}
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS: NETWORK & API
// ----------------------------------------------------------------------------

/**
 * Safe HTTP GET request with retries and timeout
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios({
        url,
        method: "GET",
        timeout: DEFAULT_TIMEOUT,
        headers: {
          "User-Agent": "RiyadStore-BotFramework/2.0",
          Accept: "application/json",
        },
        ...options,
      });
      return res.data;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
  }

  if (lastError.code === "ECONNABORTED" || lastError.message.includes("timeout")) {
    throw new Error(`API Timeout: Server did not respond within ${DEFAULT_TIMEOUT / 1000}s`);
  }
  throw new Error(`Network Error: ${lastError.response?.status || lastError.message}`);
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS: FILE SYSTEM & VALIDATION
// ----------------------------------------------------------------------------

/**
 * Validates JS syntax safely using Node vm
 */
function validateSyntax(code) {
  try {
    new vm.Script(code, { displayErrors: true });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Extract config metadata from source code safely
 */
function extractCommandMeta(code) {
  let name = null;
  let version = "1.0.0";
  let author = "Unknown";
  let category = "general";

  const nameMatch = code.match(/name\s*:\s*["'`](.*?)["'`]/);
  if (nameMatch) name = nameMatch[1].trim();

  const verMatch = code.match(/version\s*:\s*["'`](.*?)["'`]/);
  if (verMatch) version = verMatch[1].trim();

  const authorMatch = code.match(/(?:author|credits)\s*:\s*["'`](.*?)["'`]/);
  if (authorMatch) author = authorMatch[1].trim();

  const catMatch = code.match(/category\s*:\s*["'`](.*?)["'`]/);
  if (catMatch) category = catMatch[1].trim();

  return { name, version, author, category };
}

/**
 * Safely writes file atomically (Temp write -> Rename)
 */
function safeWriteFileSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${targetPath}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    throw new Error(`Write Failed: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// WORKFLOW HANDLERS
// ----------------------------------------------------------------------------

/**
 * INSTALL WORKFLOW
 */
async function handleInstall(api, event, targetQuery, commandLoader) {
  const { threadID, messageID } = event;
  let progressMsgID = null;

  try {
    // Step 1: Initialize
    progressMsgID = await sendReply(
      api,
      threadID,
      buildProgressCard("Installing Command", 10, "Fetching store details..."),
      messageID
    );

    // Step 2: Download
    await editProgress(
      api,
      buildProgressCard("Installing Command", 30, "Downloading source code..."),
      progressMsgID
    );

    let storeData;
    try {
      const searchRes = await fetchWithRetry(
        `${STORE_API_BASE}/miraistore/search?q=${encodeURIComponent(targetQuery)}`
      );

      if (!searchRes) throw new Error("Empty response from store server");

      if (typeof targetQuery === "string" && searchRes.rawCode) {
        storeData = searchRes;
      } else if (Array.isArray(searchRes.commands) && searchRes.commands.length > 0) {
        storeData =
          searchRes.commands.find(
            (c) =>
              c.name?.toLowerCase() === targetQuery.toLowerCase() ||
              String(c.id) === String(targetQuery)
          ) || searchRes.commands[0];
      } else if (Array.isArray(searchRes) && searchRes.length > 0) {
        storeData = searchRes[0];
      }
    } catch (err) {
      throw new Error(`Download Failed: ${err.message}`);
    }

    if (!storeData || !storeData.rawCode) {
      throw new Error(`Command Not Found: No script found for "${targetQuery}"`);
    }

    const code = storeData.rawCode;

    // Step 3: Validate Syntax
    await editProgress(
      api,
      buildProgressCard("Installing Command", 50, "Validating script syntax..."),
      progressMsgID
    );

    const syntaxCheck = validateSyntax(code);
    if (!syntaxCheck.valid) {
      throw new Error(`Validation Failed: ${syntaxCheck.error}`);
    }

    // Step 4: Detect Name & Check Duplicate
    await editProgress(
      api,
      buildProgressCard("Installing Command", 70, "Checking duplicates & paths..."),
      progressMsgID
    );

    const meta = extractCommandMeta(code);
    const cmdName = meta.name || storeData.name || targetQuery.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!cmdName) {
      throw new Error("Validation Failed: Could not determine command name from config");
    }

    const targetFileName = `${cmdName}.js`;
    const targetFilePath = path.join(COMMANDS_DIR, targetFileName);

    if (fs.existsSync(targetFilePath)) {
      // Overwrite protection if needed
    }

    // Step 5: Save File Safely
    await editProgress(
      api,
      buildProgressCard("Installing Command", 85, "Writing file to disk..."),
      progressMsgID
    );

    try {
      safeWriteFileSync(targetFilePath, code);
    } catch (err) {
      throw new Error(`Write Failed: ${err.message}`);
    }

    // Step 6: Load Command
    await editProgress(
      api,
      buildProgressCard("Installing Command", 95, "Loading into Framework..."),
      progressMsgID
    );

    const loader = commandLoader || api.commandLoader || global.commandLoader;

    if (loader && typeof loader.loadCommand === "function") {
      try {
        await loader.loadCommand(targetFilePath);
      } catch (err) {
        throw new Error(`Load Failed: ${err.message}`);
      }
    } else {
      try {
        delete require.cache[require.resolve(targetFilePath)];
        require(targetFilePath);
      } catch (err) {
        throw new Error(`Load Failed: ${err.message}`);
      }
    }

    // Step 7: Completed Success
    const successMsg =
      `✅ INSTALLATION SUCCESSFUL!\n` +
      `──────────────────────────────\n` +
      `📦 Command : ${cmdName}\n` +
      `👤 Author  : ${meta.author}\n` +
      `🔖 Version : ${meta.version}\n` +
      `📁 Path    : scripts/cmds/${targetFileName}\n` +
      `🚀 Status  : Loaded & Ready to use!`;

    await editProgress(api, successMsg, progressMsgID);
    await setReaction(api, "✅", messageID);
  } catch (err) {
    await setReaction(api, "❌", messageID);
    const errorCard =
      `❌ INSTALLATION FAILED\n` +
      `──────────────────────────────\n` +
      `🚨 Reason : ${err.message}\n` +
      `💡 Tip    : Check command syntax or server connection.`;

    if (progressMsgID) {
      await editProgress(api, errorCard, progressMsgID);
    } else {
      await sendReply(api, threadID, errorCard, messageID);
    }
  }
}

/**
 * UPDATE WORKFLOW
 */
async function handleUpdate(api, event, targetQuery, commandLoader) {
  const { threadID, messageID } = event;
  let progressMsgID = null;

  try {
    // Step 1: Initialize
    progressMsgID = await sendReply(
      api,
      threadID,
      buildProgressCard("Updating Command", 10, "Checking version info..."),
      messageID
    );

    // Step 2: Download New Code
    await editProgress(
      api,
      buildProgressCard("Updating Command", 35, "Downloading update package..."),
      progressMsgID
    );

    let storeData;
    try {
      const searchRes = await fetchWithRetry(
        `${STORE_API_BASE}/miraistore/search?q=${encodeURIComponent(targetQuery)}`
      );

      if (searchRes && searchRes.rawCode) {
        storeData = searchRes;
      } else if (Array.isArray(searchRes?.commands) && searchRes.commands.length > 0) {
        storeData = searchRes.commands[0];
      }
    } catch (err) {
      throw new Error(`Download Failed: ${err.message}`);
    }

    if (!storeData || !storeData.rawCode) {
      throw new Error(`Update Failed: Command "${targetQuery}" not found in store`);
    }

    const newCode = storeData.rawCode;

    // Step 3: Validate
    await editProgress(
      api,
      buildProgressCard("Updating Command", 60, "Validating updated code..."),
      progressMsgID
    );

    const syntaxCheck = validateSyntax(newCode);
    if (!syntaxCheck.valid) {
      throw new Error(`Validation Failed: ${syntaxCheck.error}`);
    }

    const meta = extractCommandMeta(newCode);
    const cmdName = meta.name || storeData.name || targetQuery;
    const targetFilePath = path.join(COMMANDS_DIR, `${cmdName}.js`);

    // Step 4: Backup & Replace
    await editProgress(
      api,
      buildProgressCard("Updating Command", 80, "Replacing old file safely..."),
      progressMsgID
    );

    if (fs.existsSync(targetFilePath)) {
      const backupPath = `${targetFilePath}.bak`;
      try {
        fs.copyFileSync(targetFilePath, backupPath);
      } catch (_) {}
    }

    try {
      safeWriteFileSync(targetFilePath, newCode);
    } catch (err) {
      throw new Error(`Write Failed: ${err.message}`);
    }

    // Step 5: Reload Command
    await editProgress(
      api,
      buildProgressCard("Updating Command", 95, "Reloading command..."),
      progressMsgID
    );

    const loader = commandLoader || api.commandLoader || global.commandLoader;
    if (loader && typeof loader.reloadCommand === "function") {
      try {
        await loader.reloadCommand(cmdName);
      } catch (err) {
        throw new Error(`Reload Failed: ${err.message}`);
      }
    } else if (loader && typeof loader.loadCommand === "function") {
      await loader.loadCommand(targetFilePath);
    } else {
      delete require.cache[require.resolve(targetFilePath)];
      require(targetFilePath);
    }

    // Clean up backup file
    const backupPath = `${targetFilePath}.bak`;
    if (fs.existsSync(backupPath)) {
      try { fs.unlinkSync(backupPath); } catch (_) {}
    }

    // Step 6: Complete
    const updateSuccessMsg =
      `🔄 UPDATE SUCCESSFUL!\n` +
      `──────────────────────────────\n` +
      `📦 Command : ${cmdName}\n` +
      `🔖 Version : ${meta.version}\n` +
      `👤 Author  : ${meta.author}\n` +
      `🚀 Status  : Reloaded successfully!`;

    await editProgress(api, updateSuccessMsg, progressMsgID);
    await setReaction(api, "✅", messageID);
  } catch (err) {
    await setReaction(api, "❌", messageID);
    const errorCard =
      `❌ UPDATE FAILED\n` +
      `──────────────────────────────\n` +
      `🚨 Reason : ${err.message}`;

    if (progressMsgID) {
      await editProgress(api, errorCard, progressMsgID);
    } else {
      await sendReply(api, threadID, errorCard, messageID);
    }
  }
}

/**
 * UNINSTALL WORKFLOW
 */
async function handleUninstall(api, event, targetName) {
  const { threadID, messageID } = event;
  try {
    const cmdName = targetName.replace(/\.js$/, "");
    const targetFilePath = path.join(COMMANDS_DIR, `${cmdName}.js`);

    if (!fs.existsSync(targetFilePath)) {
      throw new Error(`File Exists: Command file "${cmdName}.js" does not exist in scripts/cmds`);
    }

    fs.unlinkSync(targetFilePath);

    const msg =
      `🗑️ UNINSTALL SUCCESSFUL\n` +
      `──────────────────────────────\n` +
      `📦 Removed : ${cmdName}.js\n` +
      `💡 Notice  : File deleted from scripts/cmds/`;

    await sendReply(api, threadID, msg, messageID);
    await setReaction(api, "🗑️", messageID);
  } catch (err) {
    await sendReply(api, `❌ ${err.message}`, messageID);
    await setReaction(api, "❌", messageID);
  }
}

/**
 * LIST COMMANDS WORKFLOW
 */
async function handleList(api, event, page = 1) {
  const { threadID, messageID } = event;
  const limit = 6;
  const offset = (page - 1) * limit;

  try {
    const data = await fetchWithRetry(
      `${STORE_API_BASE}/miraistore/list?limit=${limit}&offset=${offset}&type=goat-command`
    );

    const commands = data.commands || data || [];
    const total = data.total || commands.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (!commands.length) {
      return sendReply(api, threadID, "📂 No commands found in store catalog.", messageID);
    }

    let menu = `🛍️ RIYAD STORE CATALOG — PAGE [ ${page} / ${totalPages} ]\n`;
    menu += `──────────────────────────────\n`;

    commands.forEach((item, index) => {
      const idx = offset + index + 1;
      menu += `${idx}. 📦 ${item.name || "Unnamed"}\n`;
      menu += `   ├‣ ID      : ${item.id}\n`;
      menu += `   ├‣ Version : ${item.version || "1.0.0"}\n`;
      menu += `   ├‣ Author  : ${item.author || "Unknown"}\n`;
      menu += `   └‣ Views   : 👁️ ${item.views || 0}\n\n`;
    });

    menu += `──────────────────────────────\n`;
    menu += `💡 Use: !rs install <ID|Name> to install\n`;
    menu += `💡 Use: !rs list ${page + 1} for next page`;

    await sendReply(api, threadID, menu, messageID);
  } catch (err) {
    await sendReply(api, `❌ Store List Error: ${err.message}`, messageID);
  }
}

/**
 * SEARCH WORKFLOW
 */
async function handleSearch(api, event, query) {
  const { threadID, messageID } = event;
  try {
    const data = await fetchWithRetry(
      `${STORE_API_BASE}/miraistore/search?q=${encodeURIComponent(query)}`
    );

    const results = data.commands || (Array.isArray(data) ? data : [data]);

    if (!results || results.length === 0 || results[0]?.message) {
      return sendReply(api, threadID, `🔍 No store packages found for "${query}".`, messageID);
    }

    let msg = `🔍 SEARCH RESULTS FOR: "${query}"\n`;
    msg += `──────────────────────────────\n`;

    results.slice(0, 5).forEach((item) => {
      msg += `📦 Name   : ${item.name || "N/A"}\n`;
      msg += `├‣ ID     : ${item.id}\n`;
      msg += `├‣ Author : ${item.author || "Unknown"}\n`;
      msg += `├‣ Ver    : ${item.version || "1.0.0"}\n`;
      msg += `└‣ Type   : ${item.type || "Command"}\n\n`;
    });

    msg += `──────────────────────────────\n`;
    msg += `💡 To install: !rs install <ID>`;

    await sendReply(api, threadID, msg, messageID);
  } catch (err) {
    await sendReply(api, `❌ Search Error: ${err.message}`, messageID);
  }
}

/**
 * COMMAND INFO WORKFLOW
 */
async function handleInfo(api, event, target) {
  const { threadID, messageID } = event;
  try {
    const data = await fetchWithRetry(
      `${STORE_API_BASE}/miraistore/search?q=${encodeURIComponent(target)}`
    );

    const item = data.rawCode ? data : data.commands?.[0] || data[0];

    if (!item) {
      return sendReply(api, threadID, `❌ Could not find command details for "${target}".`, messageID);
    }

    let msg = `ℹ️ COMMAND PACKAGE INFORMATION\n`;
    msg += `──────────────────────────────\n`;
    msg += `📦 Name        : ${item.name}\n`;
    msg += `🆔 Store ID    : ${item.id}\n`;
    msg += `👤 Author      : ${item.author || "Unknown"}\n`;
    msg += `🔖 Version     : ${item.version || "1.0.0"}\n`;
    msg += `📂 Category    : ${item.category || "General"}\n`;
    msg += `👁️ Views       : ${item.views || 0}\n`;
    msg += `❤️ Likes       : ${item.likes || 0}\n`;
    msg += `⬇️ Downloads   : ${item.installs || 0}\n`;
    msg += `──────────────────────────────\n`;
    msg += `📝 Description :\n${item.description || "No detailed description provided."}\n\n`;
    msg += `💡 Quick Install: !rs install ${item.id}`;

    await sendReply(api, threadID, msg, messageID);
  } catch (err) {
    await sendReply(api, `❌ Info Fetch Error: ${err.message}`, messageID);
  }
}

/**
 * FEATURED / TRENDING WORKFLOW
 */
async function handleFeatured(api, event) {
  const { threadID, messageID } = event;
  try {
    const data = await fetchWithRetry(`${STORE_API_BASE}/miraistore/trending?limit=5`);
    const list = Array.isArray(data) ? data : data.commands || [];

    if (!list.length) {
      return sendReply(api, threadID, "🔥 No trending commands found at the moment.", messageID);
    }

    let msg = `🔥 FEATURED & TRENDING COMMANDS\n`;
    msg += `──────────────────────────────\n`;

    list.forEach((item, index) => {
      const medal = index === 0 ? "🏆 " : index === 1 ? "🥇 " : "⭐ ";
      msg += `${medal}${item.name} (ID: ${item.id})\n`;
      msg += `├‣ Likes : ❤️ ${item.likes || 0} | Views: 👁️ ${item.views || 0}\n`;
      msg += `└‣ Author: ${item.author || "Unknown"}\n\n`;
    });

    msg += `──────────────────────────────\n`;
    msg += `💡 Install any command: !rs install <ID>`;

    await sendReply(api, threadID, msg, messageID);
  } catch (err) {
    await sendReply(api, `❌ Trending Error: ${err.message}`, messageID);
  }
}

/**
 * MAIN STORE MENU (DEFAULT)
 */
async function sendStoreMenu(api, event) {
  const { threadID, messageID } = event;

  let menu = `╭──────────────────────────────╮\n`;
  menu += `│ 📦 RIYAD STORE (RS.JS) v2.0  │\n`;
  menu += `├──────────────────────────────┤\n`;
  menu += `│ 🛍️ Commands Menu & Usage     │\n`;
  menu += `├──────────────────────────────┤\n`;
  menu += `│ ‣ !rs list [page]            │\n`;
  menu += `│   Browse store catalog       │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs search <keyword>       │\n`;
  menu += `│   Find commands by query     │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs info <id|name>         │\n`;
  menu += `│   View detailed package info │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs install <id|name>      │\n`;
  menu += `│   Animated auto-installer    │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs update <id|name>       │\n`;
  menu += `│   Safe animated updater      │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs uninstall <name>       │\n`;
  menu += `│   Remove local command file  │\n`;
  menu += `│                              │\n`;
  menu += `│ ‣ !rs featured               │\n`;
  menu += `│   View trending packages     │\n`;
  menu += `╰──────────────────────────────╯`;

  await sendReply(api, threadID, menu, messageID);
}

// ----------------------------------------------------------------------------
// FRAMEWORK MODULE EXPORT
// ----------------------------------------------------------------------------
module.exports = {
  config: {
    name: "rs",
    aliases: ["riyadstore", "rstore", "store"],
    version: "2.0.0",
    author: "Riyad",
    countDown: 3,
    role: 0,
    shortDescription: "Riyad Store — Command Store Manager for Messenger Bot",
    longDescription:
      "A high-stability command store manager featuring animated progress, safe atomic file operations, syntax validation, duplicate detection, and auto-loading.",
    category: "system",
    guide: {
      en:
        "{pn} — Show Store Menu\n" +
        "{pn} list [page] — Browse store commands\n" +
        "{pn} search <keyword> — Search store packages\n" +
        "{pn} info <id|name> — Command details\n" +
        "{pn} install <id|name> — Download, validate & auto-load\n" +
        "{pn} update <id|name> — Safe auto-update & reload\n" +
        "{pn} uninstall <name> — Safe delete command\n" +
        "{pn} featured — View trending store items",
    },
  },

  /**
   * Main Execution Handler for Framework
   */
  onStart: async function ({ api, event, args, usersData, threadsData, commandLoader }) {
    if (!api || !event) {
      console.error("[RiyadStore] Missing required api or event parameters.");
      return;
    }

    const subCommand = args[0] ? args[0].toLowerCase() : "";
    const targetQuery = args.slice(1).join(" ").trim();

    switch (subCommand) {
      case "install":
      case "i":
        if (!targetQuery) {
          return sendReply(api, event.threadID, "❌ Usage: !rs install <id|name>", event.messageID);
        }
        await handleInstall(api, event, targetQuery, commandLoader);
        break;

      case "update":
      case "up":
      case "u":
        if (!targetQuery) {
          return sendReply(api, event.threadID, "❌ Usage: !rs update <id|name>", event.messageID);
        }
        await handleUpdate(api, event, targetQuery, commandLoader);
        break;

      case "uninstall":
      case "remove":
      case "delete":
        if (!targetQuery) {
          return sendReply(api, event.threadID, "❌ Usage: !rs uninstall <name>", event.messageID);
        }
        await handleUninstall(api, event, targetQuery);
        break;

      case "list":
      case "ls":
      case "all": {
        const pageNum = parseInt(targetQuery, 10) || 1;
        await handleList(api, event, pageNum);
        break;
      }

      case "search":
      case "s":
      case "find":
        if (!targetQuery) {
          return sendReply(api, event.threadID, "❌ Usage: !rs search <keyword>", event.messageID);
        }
        await handleSearch(api, event, targetQuery);
        break;

      case "info":
      case "view":
        if (!targetQuery) {
          return sendReply(api, event.threadID, "❌ Usage: !rs info <id|name>", event.messageID);
        }
        await handleInfo(api, event, targetQuery);
        break;

      case "featured":
      case "trending":
      case "top":
        await handleFeatured(api, event);
        break;

      case "help":
      case "menu":
      default:
        await sendStoreMenu(api, event);
        break;
    }
  },
};
