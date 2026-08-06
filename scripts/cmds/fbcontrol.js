/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  File: fbcontrol.js               ║
 * ║  Author: Riyad Bot Team                                  ║
 * ║  Version: 2.0.0                                          ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * HOW TO USE (triggers):
 *   fb           → Friend Request Manager  (paginated, reply-based)
 *   fb list      → Friends List Manager
 *   fb block     → Block List Manager
 *   fb inbox     → Inbox / Recent Conversations
 *   fb sms <n> <text>   → Send DM to friend #n
 *   fb sms all <text>   → Broadcast DM to all friends
 *
 * NAVIGATION:
 *   <n>a   → Accept friend request #n       (req menu)
 *   <n>d   → Delete / reject request #n     (req menu)
 *   <n>b   → Block requester #n             (req menu)
 *   <n>uf  → Unfriend friend #n             (list menu)
 *   <n>bl  → Block friend #n                (list menu)
 *   <n>u   → Unblock user #n                (block menu)
 *   <n>msg → Open conversation with #n      (list / inbox)
 *   bulk a / bulk d / bulk b / bulk uf / bulk bl / bulk u → Bulk actions
 *   React ❤️ → Next page
 *   Reply 0   → Previous page
 *   Reply q   → Exit
 *   s <name>  → Search by name (list menu)
 *   sort az / sort new → Sort (list menu)
 *
 * ─── IMPORTANT TECHNICAL NOTE ─────────────────────────────
 * The Riyad Framework wraps the raw fca-riyad api in a
 * MessengerAdapter. Commands receive the ADAPTER as `api`,
 * not the raw api. Methods like getFriendsList, handleFriendRequest,
 * changeBlockedStatus, unfriend, and getAppState are NOT on the
 * adapter — they live on the underlying raw api (api.api).
 *
 * This command accesses them via: getRawApi(api)
 *
 * ─── KNOWN LIMITATIONS ────────────────────────────────────
 * • Friend Requests: fca-riyad does NOT expose getFriendRequests().
 *   This command fetches them via Facebook's /friends/requests/ page
 *   using the bot's session cookies. May break if Facebook changes HTML.
 *
 * • Block List: fca-riyad does NOT expose getBlockedUsers().
 *   Fetched via /settings/blocking/ page scraping. May break if
 *   Facebook changes HTML. Unblocking (changeBlockedStatus) IS native.
 *
 * • Mutual friends / request date: Not available in fca-riyad.
 * ──────────────────────────────────────────────────────────
 */

"use strict";

// ──────────────────────────────────────────────────────────
//  GET THE UNDERLYING RAW API
//  The Riyad Framework passes the MessengerAdapter as `api`.
//  The raw fca-riyad api is at api.api (adapter's this.api property).
// ──────────────────────────────────────────────────────────

/**
 * Returns the underlying raw fca-riyad api object from the adapter.
 * Falls back to `api` itself if it is already the raw api.
 * @param {Object} api - The adapter (or raw api) passed to command handlers
 * @returns {Object} Raw fca-riyad api
 */
function getRawApi(api) {
  // The FcaMessengerAdapter stores the raw api as this.api
  if (api && api.api && typeof api.api === "object") {
    return api.api;
  }
  return api;
}

// ──────────────────────────────────────────────────────────
//  SESSION STORE  (in-memory, keyed by senderID)
// ──────────────────────────────────────────────────────────

/** @type {Map<string, Object>} */
const SESSIONS = new Map();

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PER_PAGE = 10;

function sessionCreate(authorID, type, data, threadID) {
  clearSessionTimer(authorID);
  const timer = setTimeout(() => SESSIONS.delete(authorID), SESSION_TIMEOUT_MS);
  SESSIONS.set(authorID, { type, data, page: 0, authorID, threadID, lastMsgID: null, timer });
}

function sessionGet(authorID) {
  return SESSIONS.get(String(authorID)) || null;
}

function sessionClear(authorID) {
  clearSessionTimer(authorID);
  SESSIONS.delete(String(authorID));
}

function sessionResetTimer(authorID) {
  const s = SESSIONS.get(String(authorID));
  if (!s) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => SESSIONS.delete(String(authorID)), SESSION_TIMEOUT_MS);
}

function clearSessionTimer(authorID) {
  const s = SESSIONS.get(String(authorID));
  if (s && s.timer) clearTimeout(s.timer);
}

// ──────────────────────────────────────────────────────────
//  UI HELPERS
// ──────────────────────────────────────────────────────────

const DIVIDER = "─────────────────────";

function pageSlice(data, page) {
  const start = page * PER_PAGE;
  return data.slice(start, start + PER_PAGE);
}

function totalPages(data) {
  return Math.max(1, Math.ceil(data.length / PER_PAGE));
}

function buildReqMenu(requests, page) {
  const items = pageSlice(requests, page);
  const tp = totalPages(requests);
  const start = page * PER_PAGE;

  let msg = `📩 𝗙𝗿𝗶𝗲𝗻𝗱 𝗥𝗲𝗾𝘂𝗲𝘀𝘁𝘀 (${requests.length})\n${DIVIDER}\n`;
  items.forEach((r, i) => {
    const num = start + i + 1;
    msg += `${num}. ${r.name}\n`;
    msg += `   🆔 ${r.uid}\n`;
    msg += `   👤 fb.com/${r.uid}\n`;
    msg += `   ✅ Accept | ❌ Delete | 🚫 Block\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `  ❤️ React→Next  0→Prev  q→Exit`;
  return msg;
}

function buildListMenu(friends, page) {
  const items = pageSlice(friends, page);
  const tp = totalPages(friends);
  const start = page * PER_PAGE;

  let msg = `👥 𝗙𝗿𝗶𝗲𝗻𝗱𝘀 𝗟𝗶𝘀𝘁 (${friends.length})\n${DIVIDER}\n`;
  items.forEach((f, i) => {
    const num = start + i + 1;
    msg += `${num}. ${f.fullName}\n`;
    msg += `   🆔 ${f.userID}\n`;
    msg += `   👤 ${f.profileUrl || `https://www.facebook.com/${f.userID}`}\n`;
    msg += `   📷 ${f.profilePicture || "N/A"}\n`;
    msg += `   💬 Msg | 🚫 Block | ❌ Unfriend\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>msg  <n>uf Unfriend  <n>bl Block\n`;
  msg += `  s <name>→Search  sort az / sort new\n`;
  msg += `  ❤️ React→Next  0→Prev  q→Exit`;
  return msg;
}

function buildBlockMenu(blocked, page) {
  const items = pageSlice(blocked, page);
  const tp = totalPages(blocked);
  const start = page * PER_PAGE;

  let msg = `🚫 𝗕𝗹𝗼𝗰𝗸 𝗟𝗶𝘀𝘁 (${blocked.length})\n${DIVIDER}\n`;
  items.forEach((u, i) => {
    const num = start + i + 1;
    msg += `${num}. ${u.name}\n`;
    msg += `   🆔 ${u.uid}\n`;
    msg += `   👤 fb.com/${u.uid}\n`;
    msg += `   ✅ Unblock | 💬 Message\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>u Unblock  <n>msg Message\n`;
  msg += `  bulk u → Bulk unblock\n`;
  msg += `  ❤️ React→Next  0→Prev  q→Exit`;
  return msg;
}

function buildInboxMenu(threads, page) {
  const items = pageSlice(threads, page);
  const tp = totalPages(threads);
  const start = page * PER_PAGE;

  let msg = `📨 𝗜𝗻𝗯𝗼𝘅 (${threads.length})\n${DIVIDER}\n`;
  items.forEach((t, i) => {
    const num = start + i + 1;
    msg += `${num}. ${t.name}\n`;
    msg += `   🆔 ${t.threadID}\n`;
    if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 35)}..."\n`;
    msg += `   💬 Open\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>msg → Message\n`;
  msg += `  ❤️ React→Next  0→Prev  q→Exit`;
  return msg;
}

// ──────────────────────────────────────────────────────────
//  DATA FETCHERS  (all using raw fca-riyad api or cookie-based fetch)
// ──────────────────────────────────────────────────────────

/**
 * Build cookie string from appState array.
 * appState is accessible via rawApi.getAppState().
 */
function buildCookieString(rawApi) {
  try {
    const getAppState =
      typeof rawApi.getAppState === "function"
        ? rawApi.getAppState
        : null;

    if (!getAppState) return null;

    const appState = getAppState.call(rawApi);
    if (!Array.isArray(appState) || appState.length === 0) return null;

    return appState.map(c => `${c.key}=${c.value}`).join("; ");
  } catch (_) {
    return null;
  }
}

/**
 * Generic HTTPS GET helper using bot cookies.
 */
function httpsGet(url, cookieStr) {
  const https = require("https");
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "Cookie": cookieStr || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.facebook.com/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate"
      }
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://www.facebook.com${res.headers.location}`;
        return httpsGet(newUrl, cookieStr).then(resolve).catch(reject);
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.end();
  });
}

/**
 * Fetch pending friend requests.
 * Uses Facebook's /friends/requests/ page since fca-riyad has no getFriendRequests().
 * Returns: Array of { uid, name, profileUrl }
 */
async function fetchFriendRequests(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Cannot read appState / cookies from api." };

  try {
    // Try mobile endpoint first (more reliable)
    const html = await httpsGet("https://m.facebook.com/friends/requests/", cookieStr);

    const results = [];
    const seenUIDs = new Set();

    // Pattern 1: Profile links with UID in href
    // e.g. href="/profile.php?id=123456&amp;..."  or href="/username..."
    const profileRegex = /href="\/(?:profile\.php\?id=)?(\d{5,})[^"]*"[^>]*>\s*<[^>]+>\s*([^<]{2,60})/g;
    let m;
    while ((m = profileRegex.exec(html)) !== null) {
      const uid = m[1];
      const rawName = m[2].replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
      if (!uid || seenUIDs.has(uid)) continue;
      if (rawName.length < 2) continue;
      seenUIDs.add(uid);
      results.push({ uid, name: rawName, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
    }

    // Pattern 2: data-uid or data-id attributes in buttons
    const dataUidRegex = /data-(?:uid|id)="(\d{5,})"[^>]*>([^<]{2,60})/g;
    while ((m = dataUidRegex.exec(html)) !== null) {
      const uid = m[1];
      const name = m[2].replace(/&amp;/g, "&").trim();
      if (!uid || seenUIDs.has(uid) || name.length < 2) continue;
      seenUIDs.add(uid);
      results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
    }

    // Pattern 3: JSON-like actor data in HTML (for newer Facebook pages)
    const actorRegex = /"userID"\s*:\s*"(\d+)"[^}]*?"name"\s*:\s*"([^"]+)"/g;
    while ((m = actorRegex.exec(html)) !== null) {
      const uid = m[1];
      const name = m[2];
      if (!uid || seenUIDs.has(uid)) continue;
      seenUIDs.add(uid);
      results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
    }

    return { data: results, error: null };

  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Fetch friends list using raw fca-riyad api.getFriendsList().
 * Returns: { data: Array<{userID, fullName, profilePicture, profileUrl}>, error }
 */
async function fetchFriendsList(rawApi) {
  if (typeof rawApi.getFriendsList !== "function") {
    return { data: [], error: "getFriendsList is not available in this fca-riyad version." };
  }

  try {
    const friends = await rawApi.getFriendsList();
    if (!friends || !Array.isArray(friends)) {
      return { data: [], error: "getFriendsList returned no data." };
    }
    return { data: friends, error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Fetch blocked users list.
 * Uses /settings/blocking/ page since fca-riyad has no getBlockedUsers().
 * Returns: { data: Array<{uid, name, profileUrl}>, error }
 */
async function fetchBlockedUsers(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Cannot read appState / cookies from api." };

  try {
    const html = await httpsGet("https://www.facebook.com/settings/blocking/", cookieStr);
    const results = [];
    const seenUIDs = new Set();

    // Pattern: unblock links contain the UID
    const unblockRegex = /\/ajax\/profile\/removefriendconfirm\.php[^"]*uid=(\d+)|\/settings\/blocking\?[^"]*uid=(\d+)|unblock_user_id=(\d+)/g;
    let m;

    // Also look for blocked user entries in the HTML
    // Facebook shows them as: <a href="/username...">Name</a> ... Unblock
    const blockSectionMatch = html.match(/Block users[\s\S]{0,200}?(<div[\s\S]+?(?=Block Pages|Block app|Block event|<\/div>\s*<\/div>\s*<\/div>))/i);
    const searchHtml = blockSectionMatch ? blockSectionMatch[1] : html;

    // Pattern: uid in data attributes or hidden inputs
    const uidNameRegex = /uid=(\d{5,})[^"]*"[^>]*>[^<]*<\/a>\s*[^<]*([A-Za-zÀ-ÖØ-öø-ÿ\s']{2,50})/g;
    while ((m = uidNameRegex.exec(searchHtml)) !== null) {
      const uid = m[1];
      const name = m[2].trim();
      if (!uid || seenUIDs.has(uid)) continue;
      seenUIDs.add(uid);
      results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
    }

    // Pattern: find profile links followed by "Unblock"
    const profileAndUnblock = /<a[^>]+href="\/([^?"]+)[^"]*"[^>]*>([^<]{2,60})<\/a>[^<]*(?:<[^>]+>[^<]*)*Unblock/g;
    while ((m = profileAndUnblock.exec(html)) !== null) {
      const vanity = m[1];
      const name = m[2].replace(/&amp;/g, "&").trim();
      if (vanity.includes("/") || name.length < 2) continue;
      // Try to get UID from a nearby form
      const nearbyHtml = html.substring(Math.max(0, m.index - 500), m.index + 200);
      const uidMatch = nearbyHtml.match(/uid=(\d{5,})/);
      const uid = uidMatch ? uidMatch[1] : null;
      const key = uid || vanity;
      if (seenUIDs.has(key)) continue;
      seenUIDs.add(key);
      results.push({
        uid: uid || vanity,
        name,
        profileUrl: uid
          ? `https://www.facebook.com/profile.php?id=${uid}`
          : `https://www.facebook.com/${vanity}`
      });
    }

    // Pattern: JSON data embedded in page script tags
    const jsonUidName = /"blocked_uid"\s*:\s*"?(\d+)"?[^}]*?"name"\s*:\s*"([^"]+)"/g;
    while ((m = jsonUidName.exec(html)) !== null) {
      const uid = m[1];
      const name = m[2];
      if (!uid || seenUIDs.has(uid)) continue;
      seenUIDs.add(uid);
      results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
    }

    return { data: results, error: null };

  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Fetch inbox / recent DM conversations using fca-riyad native API.
 */
async function fetchInbox(api) {
  try {
    const list = await api.getThreadList(50, null, ["INBOX"]);
    const dms = (list || [])
      .filter(t => !t.isGroup)
      .slice(0, 100)
      .map(t => ({
        threadID: t.threadID,
        name: t.name || t.threadID,
        snippet: t.snippet || ""
      }));
    return { data: dms, error: null };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

// ──────────────────────────────────────────────────────────
//  SEND MENU HELPER
// ──────────────────────────────────────────────────────────

async function sendMenu(api, threadID, messageID, text, authorID, commandName, replyManager) {
  return new Promise((resolve) => {
    api.sendMessage(text, threadID, (err, info) => {
      if (err) {
        console.error("[fbcontrol] sendMenu error:", err);
        return resolve(null);
      }
      const sentMsgID = info && info.messageID;
      if (sentMsgID && replyManager) {
        replyManager.set(sentMsgID, {
          commandName,
          author: authorID,
          type: "menu"
        });
      }
      const session = sessionGet(authorID);
      if (session) session.lastMsgID = sentMsgID;
      resolve(sentMsgID);
    }, messageID);
  });
}

async function refreshMenu(api, session, threadID, messageID, authorID, replyManager) {
  let text;
  const { type, data, page } = session;
  switch (type) {
    case "req":   text = buildReqMenu(data, page);   break;
    case "list":  text = buildListMenu(data, page);  break;
    case "block": text = buildBlockMenu(data, page); break;
    case "inbox": text = buildInboxMenu(data, page); break;
    default:      text = "⚠️ Unknown session type."; break;
  }
  await sendMenu(api, threadID, messageID, text, authorID, module.exports.config.name, replyManager);
}

// ──────────────────────────────────────────────────────────
//  COMMAND EXPORT
// ──────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "fbcontrol",
    // NOTE: "in" is already an alias in inbox.js. Remove it from
    // inbox.js first if you want to use "in" as trigger here.
    aliases: ["fb", "fbc", "fbm"],
    version: "2.0.0",
    author: "Riyad Bot Team",
    countDown: 5,
    role: 0,
    category: "utility",
    description: "Facebook Account Manager: requests, friends, block list, inbox, DM.",
    guide: [
      "{pn}            → Friend Requests",
      "{pn} list       → Friends List",
      "{pn} block      → Block List",
      "{pn} inbox      → Inbox",
      "{pn} sms <n> <msg>  → DM friend #n",
      "{pn} sms all <msg>  → Broadcast DM"
    ].join("\n")
  },

  // ─────────────────────────────────────────────
  //  onStart
  // ─────────────────────────────────────────────
  onStart: async function ({ api, event, args, replyManager }) {
    const { threadID, messageID, senderID } = event;
    const sub = (args[0] || "").toLowerCase();
    const hasReaction = typeof api.setMessageReaction === "function";
    const rawApi = getRawApi(api);

    if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

    try {

      // ── fb sms ────────────────────────────────────────────
      if (sub === "sms") {
        return await handleSms(api, rawApi, event, args, threadID, messageID, hasReaction);
      }

      // ── fb  (friend requests) ─────────────────────────────
      if (!sub || sub === "req" || sub === "request") {
        await api.sendMessage("⏳ Fetching pending friend requests...", threadID);
        const { data, error } = await fetchFriendRequests(rawApi);

        if (data.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          const errMsg = error
            ? `❌ Could not fetch friend requests.\n\nError: ${error}\n\nMake sure the bot's Facebook session (appState) is active.`
            : "📩 No pending friend requests found.";
          return api.sendMessage(errMsg, threadID, messageID);
        }

        sessionCreate(senderID, "req", data, threadID);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        return await sendMenu(api, threadID, messageID, buildReqMenu(data, 0), senderID, this.config.name, replyManager);
      }

      // ── fb list ───────────────────────────────────────────
      if (sub === "list") {
        await api.sendMessage("⏳ Fetching friends list...", threadID);
        const { data, error } = await fetchFriendsList(rawApi);

        if (data.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          const errMsg = error
            ? `❌ Could not fetch friends list.\n\nError: ${error}`
            : "👥 Friends list is empty.";
          return api.sendMessage(errMsg, threadID, messageID);
        }

        // Sort A-Z by default
        const sorted = data.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        sessionCreate(senderID, "list", sorted, threadID);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        return await sendMenu(api, threadID, messageID, buildListMenu(sorted, 0), senderID, this.config.name, replyManager);
      }

      // ── fb block ──────────────────────────────────────────
      if (sub === "block") {
        await api.sendMessage("⏳ Fetching block list...", threadID);
        const { data, error } = await fetchBlockedUsers(rawApi);

        if (data.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          const errMsg = error
            ? `❌ Could not fetch block list.\n\nError: ${error}\n\nFCA note: fca-riyad has no native getBlockedUsers(). This reads Facebook's settings page which may change.`
            : "🚫 Block list is empty or could not be read.\n\nNote: This command reads the /settings/blocking page using your bot's cookies. Facebook's HTML layout may have changed.";
          return api.sendMessage(errMsg, threadID, messageID);
        }

        sessionCreate(senderID, "block", data, threadID);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        return await sendMenu(api, threadID, messageID, buildBlockMenu(data, 0), senderID, this.config.name, replyManager);
      }

      // ── fb inbox ──────────────────────────────────────────
      if (sub === "inbox") {
        await api.sendMessage("⏳ Fetching inbox...", threadID);
        const { data, error } = await fetchInbox(api);

        if (data.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          const errMsg = error
            ? `❌ Could not fetch inbox.\nError: ${error}`
            : "📨 Inbox is empty.";
          return api.sendMessage(errMsg, threadID, messageID);
        }

        sessionCreate(senderID, "inbox", data, threadID);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        return await sendMenu(api, threadID, messageID, buildInboxMenu(data, 0), senderID, this.config.name, replyManager);
      }

      // ── Unknown sub-command ───────────────────────────────
      if (hasReaction) api.setMessageReaction("❓", messageID, () => {}, true);
      return api.sendMessage(
        `❓ Unknown: "${args[0]}"\n\nValid:\n  fb → Friend Requests\n  fb list\n  fb block\n  fb inbox\n  fb sms <n> <text>\n  fb sms all <text>`,
        threadID, messageID
      );

    } catch (err) {
      console.error("[fbcontrol] onStart error:", err);
      if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
    }
  },

  // ─────────────────────────────────────────────
  //  onReply
  // ─────────────────────────────────────────────
  onReply: async function ({ api, event, Reply, replyManager }) {
    const { threadID, messageID, senderID, body } = event;
    const { author, type: replyType } = Reply;

    // Only the session author can control
    if (String(senderID) !== String(author)) return;

    const rawApi = getRawApi(api);
    const hasReaction = typeof api.setMessageReaction === "function";

    // ── Bulk confirmation reply ───────────────────────────
    if (replyType === "bulk_confirm") {
      const session = sessionGet(Reply.sessionAuthorID);
      if (!session) return api.sendMessage("⏱️ Session expired. Run command again.", threadID, messageID);
      return await executeBulkAction(api, rawApi, event, Reply, session, replyManager);
    }

    // ── Menu reply ────────────────────────────────────────
    const session = sessionGet(author);
    if (!session) {
      return api.sendMessage("⏱️ Session expired. Run the command again.", threadID, messageID);
    }

    sessionResetTimer(author);
    const input = (body || "").trim().toLowerCase();

    // Exit
    if (input === "q" || input === "quit" || input === "exit") {
      sessionClear(author);
      return api.sendMessage("👋 Menu closed.", threadID, messageID);
    }

    // Previous page
    if (input === "0") {
      if (session.page <= 0) return api.sendMessage("⚠️ Already on first page.", threadID, messageID);
      session.page--;
      return await refreshMenu(api, session, threadID, messageID, author, replyManager);
    }

    // Next page (text trigger)
    if (input === "next" || input === "n") {
      const tp = totalPages(session.data);
      if (session.page >= tp - 1) return api.sendMessage("⚠️ Already on last page.", threadID, messageID);
      session.page++;
      return await refreshMenu(api, session, threadID, messageID, author, replyManager);
    }

    // Search (list only): s <name>
    if (input.startsWith("s ") && session.type === "list") {
      const query = input.slice(2).trim().toLowerCase();
      if (!query) return api.sendMessage("⚠️ Usage: s <name>", threadID, messageID);
      const results = session.data.filter(f => (f.fullName || "").toLowerCase().includes(query));
      if (results.length === 0) return api.sendMessage(`🔍 No friends found: "${query}"`, threadID, messageID);
      const text = buildListMenu(results, 0) + `\n\n🔍 "${query}" → ${results.length} found`;
      return api.sendMessage(text, threadID, (err, info) => {
        if (!err && info?.messageID && replyManager) {
          replyManager.set(info.messageID, { commandName: module.exports.config.name, author, type: "menu" });
          session.lastMsgID = info.messageID;
        }
      }, messageID);
    }

    // Sort (list only): sort az / sort new
    if (input.startsWith("sort ") && session.type === "list") {
      const sortType = input.slice(5).trim();
      if (sortType === "az") {
        session.data = session.data.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        session.page = 0;
        await api.sendMessage("🔤 Sorted A-Z.", threadID, messageID);
        return await refreshMenu(api, session, threadID, messageID, author, replyManager);
      } else if (sortType === "new" || sortType === "newest") {
        session.data = session.data.slice().reverse();
        session.page = 0;
        await api.sendMessage("🕒 Sorted by newest.", threadID, messageID);
        return await refreshMenu(api, session, threadID, messageID, author, replyManager);
      }
      return api.sendMessage('⚠️ Use: sort az  OR  sort new', threadID, messageID);
    }

    // Bulk: bulk <action>
    if (input.startsWith("bulk ")) {
      return await handleBulkStart(api, event, session, input.slice(5).trim(), threadID, messageID, author, replyManager);
    }

    // Numbered action: 1a / 2uf / 3msg etc.
    const actionMatch = input.match(/^(\d+)(a|d|b|uf|bl|u|msg)$/);
    if (actionMatch) {
      const num = parseInt(actionMatch[1], 10);
      const action = actionMatch[2];
      const absoluteIndex = session.page * PER_PAGE + num - 1;
      const item = session.data[absoluteIndex];

      if (!item) {
        return api.sendMessage(
          `⚠️ No item #${num} on this page (${Math.min(PER_PAGE, session.data.length - session.page * PER_PAGE)} items shown).`,
          threadID, messageID
        );
      }
      return await handleItemAction(api, rawApi, session, item, action, num, absoluteIndex, threadID, messageID, author, replyManager, hasReaction);
    }

    return api.sendMessage(
      "⚠️ Invalid input. Examples:\n  1a Accept  1d Delete  1b Block\n  1uf Unfriend  1bl Block  1u Unblock  1msg Message\n  bulk a / d / b / uf / bl / u\n  s <name>  sort az  sort new\n  0=Prev  ❤️=Next  q=Exit",
      threadID, messageID
    );
  },

  // ─────────────────────────────────────────────
  //  onReaction — ❤️ = next page
  // ─────────────────────────────────────────────
  onReaction: async function ({ api, event, Reaction, replyManager }) {
    const { threadID, userID, reaction } = event;

    const isHeart = reaction === "❤️" || reaction === "\u2764\uFE0F" || reaction === "love" || reaction === "heart";
    if (!isHeart) return;

    const session = sessionGet(userID);
    if (!session) return;
    if (String(session.threadID) !== String(threadID)) return;
    if (String(userID) !== String(session.authorID)) return;

    const tp = totalPages(session.data);
    if (session.page >= tp - 1) {
      return api.sendMessage("📄 Already on the last page.", threadID);
    }

    session.page++;
    sessionResetTimer(session.authorID);
    await refreshMenu(api, session, threadID, null, session.authorID, replyManager);
  }
};

// ──────────────────────────────────────────────────────────
//  ACTION HANDLERS
// ──────────────────────────────────────────────────────────

async function handleItemAction(api, rawApi, session, item, action, displayNum, absoluteIndex, threadID, messageID, authorID, replyManager, hasReaction) {
  const uid  = item.uid || item.userID || "";
  const name = item.name || item.fullName || "Unknown";

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

  try {
    // ── ACCEPT FRIEND REQUEST ─────────────────────────────
    if (action === "a" && session.type === "req") {
      if (typeof rawApi.handleFriendRequest !== "function") {
        return api.sendMessage("❌ handleFriendRequest not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.handleFriendRequest(uid, true);
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`✅ Accepted request from ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── DELETE / REJECT FRIEND REQUEST ───────────────────
    if (action === "d" && session.type === "req") {
      if (typeof rawApi.handleFriendRequest !== "function") {
        return api.sendMessage("❌ handleFriendRequest not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.handleFriendRequest(uid, false);
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`❌ Deleted request from ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── BLOCK (from req or list) ──────────────────────────
    if (action === "b" && (session.type === "req" || session.type === "list")) {
      if (typeof rawApi.changeBlockedStatus !== "function") {
        return api.sendMessage("❌ changeBlockedStatus not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.changeBlockedStatus(uid, true);
      if (session.type === "req") {
        try { await rawApi.handleFriendRequest(uid, false); } catch (_) {}
      }
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`🚫 Blocked ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── UNFRIEND ──────────────────────────────────────────
    if (action === "uf" && session.type === "list") {
      if (typeof rawApi.unfriend !== "function") {
        return api.sendMessage("❌ unfriend not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.unfriend(uid);
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`❌ Unfriended ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── BLOCK FRIEND (from list) ──────────────────────────
    if (action === "bl" && session.type === "list") {
      if (typeof rawApi.changeBlockedStatus !== "function") {
        return api.sendMessage("❌ changeBlockedStatus not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.changeBlockedStatus(uid, true);
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`🚫 Blocked ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── UNBLOCK ───────────────────────────────────────────
    if (action === "u" && session.type === "block") {
      if (typeof rawApi.changeBlockedStatus !== "function") {
        return api.sendMessage("❌ changeBlockedStatus not available in this fca-riyad version.", threadID, messageID);
      }
      await rawApi.changeBlockedStatus(uid, false);
      session.data.splice(absoluteIndex, 1);
      adjustPage(session);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`✅ Unblocked ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── MESSAGE ───────────────────────────────────────────
    if (action === "msg") {
      const targetID = item.threadID || uid;
      await api.sendMessage(
        `📨 Sending to ${name} (${targetID})...`,
        threadID, messageID
      );
      await api.sendMessage(`👋 Hi ${name}! (Message from Riyad Bot)`, targetID);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      return;
    }

    if (hasReaction) api.setMessageReaction("❓", messageID, () => {}, true);
    return api.sendMessage(`⚠️ Action "${action}" not valid in "${session.type}" menu.`, threadID, messageID);

  } catch (err) {
    console.error("[fbcontrol] handleItemAction error:", err);
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(`❌ Failed: ${err.message}`, threadID, messageID);
  }
}

/** Adjust page number if items were removed and page is now out of range */
function adjustPage(session) {
  if (session.page > 0 && session.page >= totalPages(session.data)) {
    session.page--;
  }
}

/** Show bulk confirmation prompt */
async function handleBulkStart(api, event, session, cmd, threadID, messageID, authorID, replyManager) {
  const { type } = session;
  const validActions = { req: ["a","d","b"], list: ["uf","bl"], block: ["u"], inbox: [] };
  const allowed = validActions[type] || [];

  if (!allowed.includes(cmd)) {
    const valid = allowed.length ? allowed.map(a => `bulk ${a}`).join(", ") : "none";
    return api.sendMessage(`⚠️ Bulk "${cmd}" not valid here.\nAllowed: ${valid}`, threadID, messageID);
  }

  const labels = { a:"Accept All Requests", d:"Delete All Requests", b:"Block All Requesters", uf:"Unfriend ALL", bl:"Block ALL Friends", u:"Unblock ALL" };
  const label = labels[cmd] || cmd;

  return api.sendMessage(
    `⚠️ 𝗕𝗨𝗟𝗞 𝗖𝗢𝗡𝗙𝗜𝗥𝗠\n${DIVIDER}\nAction: ${label}\nItems: ${session.data.length}\n\nReply YES to confirm.\nReply NO to cancel.\n⚠️ Cannot be undone!`,
    threadID,
    (err, info) => {
      if (err || !info?.messageID) return;
      if (replyManager) {
        replyManager.set(info.messageID, {
          commandName: module.exports.config.name,
          author: authorID,
          type: "bulk_confirm",
          bulkCmd: cmd,
          sessionAuthorID: authorID
        });
      }
    },
    messageID
  );
}

/** Execute the confirmed bulk action */
async function executeBulkAction(api, rawApi, event, Reply, session, replyManager) {
  const { threadID, messageID, body } = event;
  const hasReaction = typeof api.setMessageReaction === "function";
  const input = (body || "").trim().toLowerCase();

  if (input !== "yes" && input !== "confirm") {
    return api.sendMessage("🚫 Bulk action cancelled.", threadID, messageID);
  }

  const { bulkCmd } = Reply;
  const items = session.data.slice();
  let success = 0, failed = 0;

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
  await api.sendMessage(`📤 Bulk action started on ${items.length} items...`, threadID, messageID);

  for (const item of items) {
    const uid = item.uid || item.userID || "";
    try {
      if (bulkCmd === "a" && typeof rawApi.handleFriendRequest === "function") {
        await rawApi.handleFriendRequest(uid, true);
      } else if (bulkCmd === "d" && typeof rawApi.handleFriendRequest === "function") {
        await rawApi.handleFriendRequest(uid, false);
      } else if (bulkCmd === "b") {
        if (typeof rawApi.changeBlockedStatus === "function") await rawApi.changeBlockedStatus(uid, true);
        if (typeof rawApi.handleFriendRequest === "function") {
          try { await rawApi.handleFriendRequest(uid, false); } catch (_) {}
        }
      } else if (bulkCmd === "uf" && typeof rawApi.unfriend === "function") {
        await rawApi.unfriend(uid);
      } else if (bulkCmd === "bl" && typeof rawApi.changeBlockedStatus === "function") {
        await rawApi.changeBlockedStatus(uid, true);
      } else if (bulkCmd === "u" && typeof rawApi.changeBlockedStatus === "function") {
        await rawApi.changeBlockedStatus(uid, false);
      } else {
        throw new Error(`Method not available for action "${bulkCmd}"`);
      }
      success++;
    } catch (err) {
      console.error(`[fbcontrol] bulk error on ${uid}:`, err.message);
      failed++;
    }
    await new Promise(r => setTimeout(r, 350)); // Rate limit protection
  }

  session.data = [];
  session.page = 0;

  if (hasReaction) api.setMessageReaction(failed === 0 ? "✅" : "⚠️", messageID, () => {}, true);
  return api.sendMessage(
    `📊 𝗕𝘂𝗹𝗸 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲\n${DIVIDER}\n✔ Success: ${success}\n❌ Failed: ${failed}\n\n${failed > 0 ? "Some failed — check bot logs.\n" : ""}Menu closed. Run command again to refresh.`,
    threadID, messageID
  );
}

/** Handle fb sms sub-command */
async function handleSms(api, rawApi, event, args, threadID, messageID, hasReaction) {
  const target  = args[1] || "";
  const msgText = args.slice(2).join(" ");

  if (!target || !msgText) {
    return api.sendMessage(
      "⚠️ Usage:\n  fb sms <n> <text>      — DM friend #n\n  fb sms all <text>    — Broadcast",
      threadID, messageID
    );
  }

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

  const { data: friends, error } = await fetchFriendsList(rawApi);

  if (!friends || friends.length === 0) {
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    const errMsg = error
      ? `❌ Could not fetch friends: ${error}`
      : "👥 Friends list is empty.";
    return api.sendMessage(errMsg, threadID, messageID);
  }

  // Sort A-Z to match list menu numbering
  const sorted = friends.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  // ── Broadcast to all ──────────────────────────────────
  if (target.toLowerCase() === "all") {
    await api.sendMessage(`📤 Sending to all ${sorted.length} friends...\n"${msgText}"`, threadID, messageID);

    let success = 0, failed = 0;

    for (let i = 0; i < sorted.length; i++) {
      const friend = sorted[i];
      try {
        await api.sendMessage(msgText, friend.userID);
        success++;
      } catch (err) {
        console.error(`[fbcontrol] sms all failed for ${friend.userID}:`, err.message);
        failed++;
      }
      // Progress update every 10 sends
      if ((success + failed) % 10 === 0) {
        await api.sendMessage(`⏳ ${success + failed}/${sorted.length}  ✔ ${success}  ❌ ${failed}`, threadID);
      }
      await new Promise(r => setTimeout(r, 600)); // Facebook rate limit
    }

    if (hasReaction) api.setMessageReaction(failed === 0 ? "✅" : "⚠️", messageID, () => {}, true);
    return api.sendMessage(
      `📊 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲\n${DIVIDER}\n✔ Success: ${success}\n❌ Failed: ${failed}\n\nCompleted.`,
      threadID, messageID
    );
  }

  // ── Send to friend #n ─────────────────────────────────
  const idx = parseInt(target, 10);
  if (isNaN(idx) || idx < 1 || idx > sorted.length) {
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(
      `⚠️ Invalid number: "${target}"\nYou have ${sorted.length} friends. Use 1-${sorted.length}.`,
      threadID, messageID
    );
  }

  const friend = sorted[idx - 1];
  try {
    await api.sendMessage(msgText, friend.userID);
    if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
    return api.sendMessage(
      `✅ Message sent to ${friend.fullName} (#${idx}).\n💬 "${msgText}"`,
      threadID, messageID
    );
  } catch (err) {
    console.error("[fbcontrol] sms send error:", err.message);
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(`❌ Failed to send to ${friend.fullName}: ${err.message}`, threadID, messageID);
  }
}
