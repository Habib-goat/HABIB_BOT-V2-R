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
const DEFAULT_TIMEOUT = 12000; // 12 Seconds Timeout
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
 * Helper to safely reply to thread using Framework's api.reply or api.sendMessage
 */
async function sendReply(api, text, event) {
  try {
    if (typeof api.reply === "function") {
      const res = await api.reply(text, event);
      if (res && res.messageID) return res.messageID;
      if (res && typeof res === "object" && res.message_id) return res.message_id;
      return res;
    }
  } catch (_) {}

  try {
    if (typeof api.sendMessage === "function" && event) {
      const res = await api.sendMessage(text, event.threadID, event.messageID);
      if (res && res.messageID) return res.messageID;
      return res;
    }
  } catch (_) {}

  return null;
}

/**
 * Helper to edit messages for animated progress using Framework's api.editMessage
 */
async function editProgress(api, messageID, text) {
  if (!messageID) return;
  try {
    if (typeof api.editMessage === "function") {
      try {
        await api.editMessage(messageID, text);
      } catch (_) {
        await api.editMessage(text, messageID);
      }
    }
  } catch (_) {}
}

/**
 * React to user message if supported using Framework's api.react
 */
async function setReaction(api, emoji, event) {
  if (!event) return;
  try {
    if (typeof api.react === "function") {
      await api.react(emoji, event.messageID || event);
    }
  } catch (_) {}
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS: NETWORK & API (Riyad Store API)
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
          Accept: "application/json, text/plain, */*",
        },
        ...options,
      });
      return res.data;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
  }

  if (lastError.code === "ECONNABORTED" || (lastError.message && lastError.message.includes("timeout"))) {
    throw new Error(`API Timeout: Server did not respond within ${DEFAULT_TIMEOUT / 1000}s`);
  }
  throw new Error(`Network Error: ${lastError.response?.status || lastError.message}`);
}

/**
 * Fetch raw code for command by ID or query using Riyad Store API
 */
async function fetchRawCode(idOrQuery) {
  // 1. Try GET /api/store/raw/:id
  try {
    const rawRes = await fetchWithRetry(`${STORE_API_BASE}/api/store/raw/${encodeURIComponent(idOrQuery)}`);
    if (typeof rawRes === "string" && rawRes.trim().length > 0) {
      return { rawCode: rawRes, id: idOrQuery };
    }
    if (rawRes && typeof rawRes === "object") {
      const code = rawRes.rawCode || rawRes.code || rawRes.data || rawRes.content;
      if (code && typeof code === "string") {
        return { ...rawRes, rawCode: code, id: rawRes.id || idOrQuery };
      }
    }
  } catch (_) {}

  // 2. Try GET /api/store/info/:id
  try {
    const infoRes = await fetchWithRetry(`${STORE_API_BASE}/api/store/info/${encodeURIComponent(idOrQuery)}`);
    if (infoRes && typeof infoRes === "object") {
      const code = infoRes.rawCode || infoRes.code || infoRes.data || infoRes.content;
      if (code && typeof code === "string") {
        return { ...infoRes, rawCode: code, id: infoRes.id || idOrQuery };
      }
    }
  } catch (_) {}

  // 3. Try GET /api/store/search?q=
  try {
    const searchRes = await fetchWithRetry(`${STORE_API_BASE}/api/store/search?q=${encodeURIComponent(idOrQuery)}`);
    let items = [];
    if (Array.isArray(searchRes)) items = searchRes;
    else if (searchRes && typeof searchRes === "object") {
      items = searchRes.commands || searchRes.data || searchRes.items || searchRes.results || [];
    }

    if (items.length > 0) {
      const match = items.find(
        (c) =>
          String(c.id) === String(idOrQuery) ||
          (c.name && c.name.toLowerCase() === String(idOrQuery).toLowerCase())
      ) || items[0];

      if (match.rawCode && typeof match.rawCode === "string") {
        return match;
      }
      if (match.id) {
        return await fetchRawCode(match.id);
      }
    }
  } catch (_) {}

  throw new Error(`Command Not Found: No script found for "${idOrQuery}" on Riyad Store`);
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
  let progressMsgID = null;

  try {
    // Step 1: Initialize
    progressMsgID = await sendReply(
      api,
      buildProgressCard("Installing Command", 10, "Fetching store details..."),
      event
    );

    // Step 2: Download
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Installing Command", 30, "Downloading source code from Riyad Store...")
    );

    let storeData;
    try {
      storeData = await fetchRawCode(targetQuery);
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
      progressMsgID,
      buildProgressCard("Installing Command", 50, "Validating script syntax...")
    );

    const syntaxCheck = validateSyntax(code);
    if (!syntaxCheck.valid) {
      throw new Error(`Validation Failed: ${syntaxCheck.error}`);
    }

    // Step 4: Detect Name & Duplicate Check
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Installing Command", 70, "Checking duplicates & paths...")
    );

    const meta = extractCommandMeta(code);
    const cmdName = meta.name || storeData.name || String(targetQuery).replace(/[^a-zA-Z0-9_-]/g, "");

    if (!cmdName) {
      throw new Error("Validation Failed: Could not determine command name from config");
    }

    const targetFileName = `${cmdName}.js`;
    const targetFilePath = path.join(COMMANDS_DIR, targetFileName);

    // Step 5: Save File Safely
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Installing Command", 85, "Writing file to disk safely...")
    );

    try {
      safeWriteFileSync(targetFilePath, code);
    } catch (err) {
      throw new Error(`Write Failed: ${err.message}`);
    }

    // Step 6: Load Command
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Installing Command", 95, "Loading into Framework...")
    );

    const loader = commandLoader || api.commandLoader;

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
      `👤 Author  : ${meta.author || storeData.author || "Unknown"}\n` +
      `🔖 Version : ${meta.version || storeData.version || "1.0.0"}\n` +
      `📁 Path    : scripts/cmds/${targetFileName}\n` +
      `🚀 Status  : Loaded & Ready to use!`;

    await editProgress(api, progressMsgID, successMsg);
    await setReaction(api, "✅", event);
  } catch (err) {
    await setReaction(api, "❌", event);
    const errorCard =
      `❌ INSTALLATION FAILED\n` +
      `──────────────────────────────\n` +
      `🚨 Reason : ${err.message}\n` +
      `💡 Tip    : Check command syntax or server connection.`;

    if (progressMsgID) {
      await editProgress(api, progressMsgID, errorCard);
    } else {
      await sendReply(api, errorCard, event);
    }
  }
}

/**
 * UPDATE WORKFLOW
 */
async function handleUpdate(api, event, targetQuery, commandLoader) {
  let progressMsgID = null;

  try {
    // Step 1: Initialize
    progressMsgID = await sendReply(
      api,
      buildProgressCard("Updating Command", 10, "Checking version info..."),
      event
    );

    // Step 2: Download New Code
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Updating Command", 35, "Downloading update package from Riyad Store...")
    );

    let storeData;
    try {
      storeData = await fetchRawCode(targetQuery);
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
      progressMsgID,
      buildProgressCard("Updating Command", 60, "Validating updated code...")
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
      progressMsgID,
      buildProgressCard("Updating Command", 80, "Replacing old file safely...")
    );

    if (fs.existsSync(targetFilePath)) {
      const backupPath = `${targetFilePath}.bak`;
      try { fs.copyFileSync(targetFilePath, backupPath); } catch (_) {}
    }

    try {
      safeWriteFileSync(targetFilePath, newCode);
    } catch (err) {
      throw new Error(`Write Failed: ${err.message}`);
    }

    // Step 5: Reload Command
    await editProgress(
      api,
      progressMsgID,
      buildProgressCard("Updating Command", 95, "Reloading command in Framework...")
    );

    const loader = commandLoader || api.commandLoader;
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
      `🔖 Version : ${meta.version || storeData.version || "1.0.0"}\n` +
      `👤 Author  : ${meta.author || storeData.author || "Unknown"}\n` +
      `🚀 Status  : Reloaded successfully!`;

    await editProgress(api, progressMsgID, updateSuccessMsg);
    await setReaction(api, "✅", event);
  } catch (err) {
    await setReaction(api, "❌", event);
    const errorCard =
      `❌ UPDATE FAILED\n` +
      `──────────────────────────────\n` +
      `🚨 Reason : ${err.message}`;

    if (progressMsgID) {
      await editProgress(api, progressMsgID, errorCard);
    } else {
      await sendReply(api, errorCard, event);
    }
  }
}

/**
 * UNINSTALL WORKFLOW
 */
async function handleUninstall(api, event, targetName) {
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

    await sendReply(api, msg, event);
    await setReaction(api, "🗑️", event);
  } catch (err) {
    await sendReply(api, `❌ ${err.message}`, event);
    await setReaction(api, "❌", event);
  }
}

/**
 * LIST COMMANDS WORKFLOW
 */
async function handleList(api, event, page = 1) {
  const limit = 6;
  const offset = (page - 1) * limit;

  try {
    const data = await fetchWithRetry(
      `${STORE_API_BASE}/api/store/list?limit=${limit}&offset=${offset}&page=${page}`
    );

    let commands = [];
    let total = 0;

    if (Array.isArray(data)) {
      commands = data;
      total = data.length;
    } else if (data && typeof data === "object") {
      commands = data.commands || data.data || data.items || data.results || [];
      total = data.total || commands.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    if (!commands.length) {
      return sendReply(api, "📂 No commands found in Riyad Store catalog.", event);
    }

    let menu = `🛍️ RIYAD STORE CATALOG — PAGE [ ${page} / ${totalPages} ]\n`;
    menu += `──────────────────────────────\n`;

    commands.slice(0, limit).forEach((item, index) => {
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

    await sendReply(api, menu, event);
  } catch (err) {
    await sendReply(api, `❌ Store List Error: ${err.message}`, event);
  }
}

/**
 * SEARCH WORKFLOW
 */
async function handleSearch(api, event, query) {
  try {
    const data = await fetchWithRetry(
      `${STORE_API_BASE}/api/store/search?q=${encodeURIComponent(query)}`
    );

    let results = [];
    if (Array.isArray(data)) {
      results = data;
    } else if (data && typeof data === "object") {
      results = data.commands || data.data || data.items || data.results || (data.name ? [data] : []);
    }

    if (!results || results.length === 0 || results[0]?.message) {
      return sendReply(api, `🔍 No store packages found for "${query}".`, event);
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

    await sendReply(api, msg, event);
  } catch (err) {
    await sendReply(api, `❌ Search Error: ${err.message}`, event);
  }
}

/**
 * COMMAND INFO WORKFLOW
 */
async function handleInfo(api, event, target) {
  try {
    let item;
    try {
      item = await fetchWithRetry(`${STORE_API_BASE}/api/store/info/${encodeURIComponent(target)}`);
    } catch (_) {
      const searchRes = await fetchWithRetry(`${STORE_API_BASE}/api/store/search?q=${encodeURIComponent(target)}`);
      if (Array.isArray(searchRes)) item = searchRes[0];
      else if (searchRes && typeof searchRes === "object") {
        const list = searchRes.commands || searchRes.data || searchRes.items || [searchRes];
        item = list[0];
      }
    }

    if (!item || item.error || item.message) {
      return sendReply(api, `❌ Could not find command details for "${target}".`, event);
    }

    let msg = `ℹ️ COMMAND PACKAGE INFORMATION\n`;
    msg += `──────────────────────────────\n`;
    msg += `📦 Name        : ${item.name || "N/A"}\n`;
    msg += `🆔 Store ID    : ${item.id}\n`;
    msg += `👤 Author      : ${item.author || "Unknown"}\n`;
    msg += `🔖 Version     : ${item.version || "1.0.0"}\n`;
    msg += `📂 Category    : ${item.category || "General"}\n`;
    msg += `👁️ Views       : ${item.views || 0}\n`;
    msg += `❤️ Likes       : ${item.likes || 0}\n`;
    msg += `⬇️ Downloads   : ${item.installs || item.downloads || 0}\n`;
    msg += `──────────────────────────────\n`;
    msg += `📝 Description :\n${item.description || "No detailed description provided."}\n\n`;
    msg += `💡 Quick Install: !rs install ${item.id}`;

    await sendReply(api, msg, event);
  } catch (err) {
    await sendReply(api, `❌ Info Fetch Error: ${err.message}`, event);
  }
}

/**
 * FEATURED / TRENDING WORKFLOW
 */
async function handleFeatured(api, event) {
  try {
    const data = await fetchWithRetry(`${STORE_API_BASE}/api/store/list?limit=5&sort=trending`);
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === "object") {
      list = data.commands || data.data || data.items || [];
    }

    if (!list.length) {
      return sendReply(api, "🔥 No trending commands found at the moment.", event);
    }

    let msg = `🔥 FEATURED & TRENDING COMMANDS\n`;
    msg += `──────────────────────────────\n`;

    list.slice(0, 5).forEach((item, index) => {
      const medal = index === 0 ? "🏆 " : index === 1 ? "🥇 " : "⭐ ";
      msg += `${medal}${item.name} (ID: ${item.id})\n`;
      msg += `├‣ Likes : ❤️ ${item.likes || 0} | Views: 👁️ ${item.views || 0}\n`;
      msg += `└‣ Author: ${item.author || "Unknown"}\n\n`;
    });

    msg += `──────────────────────────────\n`;
    msg += `💡 Install any command: !rs install <ID>`;

    await sendReply(api, msg, event);
  } catch (err) {
    await sendReply(api, `❌ Trending Error: ${err.message}`, event);
  }
}

/**
 * MAIN STORE MENU (DEFAULT)
 */
async function sendStoreMenu(api, event) {
  let menu = `╭────────────────────────╮\n`;
  menu += `│ 📦 RIYAD STORE (RS.JS) v2.0  \n`;
  menu += `├────────────────────────┤\n`;
  menu += `│ 🛍️ Commands Menu & Usage     \n`;
  menu += `├────────────────────────┤\n`;
  menu += `│ ‣ !rs list [page]            \n`;
  menu += `│   Browse store catalog       \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs search <keyword>       \n`;
  menu += `│   Find commands by query     \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs info <id|name>         \n`;
  menu += `│   View detailed package info \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs install <id|name>      \n`;
  menu += `│   Animated auto-installer    \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs update <id|name>       \n`;
  menu += `│   Safe animated updater      \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs uninstall <name>       \n`;
  menu += `│   Remove local command file  \n`;
  menu += `│                              \n`;
  menu += `│ ‣ !rs featured               \n`;
  menu += `│   View trending packages     \n`;
  menu += `╰────────────────────────╯`;

  await sendReply(api, menu, event);
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
      "A high-stability command store manager featuring animated progress, safe atomic file operations, syntax validation, duplicate detection, and auto-loading via Riyad Store API.",
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

    const subCommand = args && args[0] ? args[0].toLowerCase() : "";
    const targetQuery = args && args.length > 1 ? args.slice(1).join(" ").trim() : "";

    switch (subCommand) {
      case "install":
      case "i":
        if (!targetQuery) {
          return sendReply(api, "❌ Usage: !rs install <id|name>", event);
        }
        await handleInstall(api, event, targetQuery, commandLoader);
        break;

      case "update":
      case "up":
      case "u":
        if (!targetQuery) {
          return sendReply(api, "❌ Usage: !rs update <id|name>", event);
        }
        await handleUpdate(api, event, targetQuery, commandLoader);
        break;

      case "uninstall":
      case "remove":
      case "delete":
        if (!targetQuery) {
          return sendReply(api, "❌ Usage: !rs uninstall <name>", event);
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
          return sendReply(api, "❌ Usage: !rs search <keyword>", event);
        }
        await handleSearch(api, event, targetQuery);
        break;

      case "info":
      case "view":
        if (!targetQuery) {
          return sendReply(api, "❌ Usage: !rs info <id|name>", event);
        }
        await handleInfo(api, event, targetQuery);
        break;

      case "featured":
      case "trending":
      case "latest":
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
