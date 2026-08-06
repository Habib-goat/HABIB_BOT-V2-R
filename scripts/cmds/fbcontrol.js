/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  File: fbcontrol.js               ║
 * ║  Author: Riyad Bot Team                                  ║
 * ║  Version: 1.0.0                                          ║
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
 * NAVIGATION (works in every list menu):
 *   Reply <n>a   → Accept friend request #n   (req menu only)
 *   Reply <n>d   → Delete / reject request #n  (req menu only)
 *   Reply <n>b   → Block requester #n          (req menu only)
 *   Reply <n>uf  → Unfriend friend #n          (list menu only)
 *   Reply <n>bl  → Block friend #n             (list menu only)
 *   Reply <n>msg → Open conversation with #n   (list / inbox)
 *   Reply <n>u   → Unblock user #n             (block menu only)
 *   Reply bulk a / bulk d / bulk b / bulk uf / bulk bl
 *              → Bulk action (with confirmation)
 *   React ❤️    → Next page
 *   Reply 0      → Previous page
 *   Reply q      → Exit / close menu
 *   Reply s <name> → Search by name (list menu only)
 *   Reply sort az  → Sort A-Z  (list menu only)
 *   Reply sort new → Sort newest  (list menu only)
 *
 * ─── KNOWN LIMITATIONS ────────────────────────────────────
 * • getFriendRequests: fca-riyad does NOT expose a native
 *   getFriendRequests() API. This command fetches pending
 *   requests via a direct Facebook GraphQL/Ajax call using
 *   the bot's cookies (api.getAppState). If Facebook changes
 *   their internal API structure this section may stop working.
 *   handleFriendRequest(uid, true/false) IS natively supported.
 *
 * • getBlockedUsers: fca-riyad does NOT expose a native
 *   getBlockedUsers() API. The block list is fetched via a
 *   direct Ajax call using bot cookies. Unblocking (changeBlockedStatus)
 *   IS natively supported.
 *
 * • Mutual friends / request date: Not available via fca-riyad.
 *   These fields are noted in UI but will show "N/A".
 *
 * • Profile pictures in text menus: Only a profile URL link is
 *   shown (no image attachment) to keep menus fast and readable.
 * ──────────────────────────────────────────────────────────
 */

"use strict";

// ──────────────────────────────────────────────────────────
//  SESSION STORE  (in-memory, keyed by senderID)
// ──────────────────────────────────────────────────────────

/** @type {Map<string, SessionData>} */
const SESSIONS = new Map();

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PER_PAGE = 10;

/**
 * @typedef {Object} SessionData
 * @property {'req'|'list'|'block'|'inbox'} type
 * @property {Array<Object>} data        - Full dataset (all pages)
 * @property {number}        page        - Current 0-based page index
 * @property {string}        authorID    - Sender who opened the menu
 * @property {string}        threadID    - Thread where the menu lives
 * @property {string|null}   lastMsgID   - MessageID of the last menu msg (for reaction tracking)
 * @property {ReturnType<typeof setTimeout>} timer - Auto-expire handle
 */

function sessionCreate(authorID, type, data, threadID) {
  clearSessionTimer(authorID);
  const timer = setTimeout(() => SESSIONS.delete(authorID), SESSION_TIMEOUT_MS);
  SESSIONS.set(authorID, { type, data, page: 0, authorID, threadID, lastMsgID: null, timer });
}

function sessionGet(authorID) {
  return SESSIONS.get(authorID) || null;
}

function sessionClear(authorID) {
  clearSessionTimer(authorID);
  SESSIONS.delete(authorID);
}

function sessionResetTimer(authorID) {
  const s = SESSIONS.get(authorID);
  if (!s) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => SESSIONS.delete(authorID), SESSION_TIMEOUT_MS);
}

function clearSessionTimer(authorID) {
  const s = SESSIONS.get(authorID);
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

/**
 * Build the Friend Requests menu page text.
 */
function buildReqMenu(requests, page) {
  const items = pageSlice(requests, page);
  const tp = totalPages(requests);
  const start = page * PER_PAGE;

  let msg = `📩 𝗙𝗿𝗶𝗲𝗻𝗱 𝗥𝗲𝗾𝘂𝗲𝘀𝘁𝘀 (${requests.length})\n${DIVIDER}\n`;
  items.forEach((r, i) => {
    const num = start + i + 1;
    msg += `${num}. ${r.name}\n`;
    msg += `   🆔 UID: ${r.uid}\n`;
    msg += `   👤 ${r.profileUrl || `https://facebook.com/${r.uid}`}\n`;
    msg += `   ✅ Accept | ❌ Delete | 🚫 Block\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>a → Accept (e.g. 1a)\n`;
  msg += `  <n>d → Delete (e.g. 1d)\n`;
  msg += `  <n>b → Block  (e.g. 1b)\n`;
  msg += `  bulk a / bulk d / bulk b → Bulk actions\n`;
  msg += `  ❤️ React → Next Page  |  0 → Prev Page  |  q → Exit`;
  return msg;
}

/**
 * Build the Friends List menu page text.
 */
function buildListMenu(friends, page) {
  const items = pageSlice(friends, page);
  const tp = totalPages(friends);
  const start = page * PER_PAGE;

  let msg = `👥 𝗙𝗿𝗶𝗲𝗻𝗱𝘀 𝗟𝗶𝘀𝘁 (${friends.length})\n${DIVIDER}\n`;
  items.forEach((f, i) => {
    const num = start + i + 1;
    msg += `${num}. ${f.fullName}\n`;
    msg += `   🆔 UID: ${f.userID}\n`;
    msg += `   👤 ${f.profileUrl || `https://facebook.com/${f.userID}`}\n`;
    msg += `   📷 ${f.profilePicture || "N/A"}\n`;
    msg += `   💬 Msg | 🚫 Block | ❌ Unfriend\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>msg → Message  |  <n>uf → Unfriend  |  <n>bl → Block\n`;
  msg += `  bulk uf / bulk bl → Bulk actions\n`;
  msg += `  s <name> → Search  |  sort az / sort new → Sort\n`;
  msg += `  ❤️ React → Next Page  |  0 → Prev Page  |  q → Exit`;
  return msg;
}

/**
 * Build the Block List menu page text.
 */
function buildBlockMenu(blocked, page) {
  const items = pageSlice(blocked, page);
  const tp = totalPages(blocked);
  const start = page * PER_PAGE;

  let msg = `🚫 𝗕𝗹𝗼𝗰𝗸 𝗟𝗶𝘀𝘁 (${blocked.length})\n${DIVIDER}\n`;
  items.forEach((u, i) => {
    const num = start + i + 1;
    msg += `${num}. ${u.name}\n`;
    msg += `   🆔 UID: ${u.uid}\n`;
    msg += `   👤 ${u.profileUrl || `https://facebook.com/${u.uid}`}\n`;
    msg += `   ✅ Unblock | 💬 Message\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>u → Unblock  |  <n>msg → Message\n`;
  msg += `  bulk u → Bulk unblock\n`;
  msg += `  ❤️ React → Next Page  |  0 → Prev Page  |  q → Exit`;
  return msg;
}

/**
 * Build the Inbox menu page text.
 */
function buildInboxMenu(threads, page) {
  const items = pageSlice(threads, page);
  const tp = totalPages(threads);
  const start = page * PER_PAGE;

  let msg = `📨 𝗜𝗻𝗯𝗼𝘅 / 𝗥𝗲𝗰𝗲𝗻𝘁 𝗖𝗼𝗻𝘃𝗲𝗿𝘀𝗮𝘁𝗶𝗼𝗻𝘀 (${threads.length})\n${DIVIDER}\n`;
  items.forEach((t, i) => {
    const num = start + i + 1;
    const threadName = t.name || t.threadID;
    msg += `${num}. ${threadName}\n`;
    msg += `   🆔 TID: ${t.threadID}\n`;
    if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 40)}..."\n`;
    msg += `   💬 Open | 👤 Profile\n\n`;
  });

  msg += `${DIVIDER}\n`;
  msg += `📄 Page ${page + 1}/${tp}\n\n`;
  msg += `📌 𝗖𝗼𝗻𝘁𝗿𝗼𝗹𝘀:\n`;
  msg += `  <n>msg → Open conversation\n`;
  msg += `  ❤️ React → Next Page  |  0 → Prev Page  |  q → Exit`;
  return msg;
}

// ──────────────────────────────────────────────────────────
//  DATA FETCHERS
// ──────────────────────────────────────────────────────────

/**
 * Fetch pending friend requests.
 *
 * fca-riyad does NOT expose a native getFriendRequests() API.
 * We call the Facebook friend-request Ajax endpoint using the
 * bot's session cookies. Returns an array of { uid, name, profileUrl }.
 *
 * NOTE: If this fails (e.g. Facebook changes its API), the
 *       function returns [] and logs an error.
 */
async function fetchFriendRequests(api) {
  try {
    const appState = api.getAppState();
    if (!Array.isArray(appState)) throw new Error("Cannot read appState.");

    // Build a cookie string from the appState
    const cookieStr = appState.map(c => `${c.key}=${c.value}`).join("; ");

    // Extract fb_dtsg token (needed for POST requests)
    const fb_dtsg = (appState.find(c => c.key === "fb_dtsg") || {}).value || "";

    // Try GraphQL endpoint for pending friend requests
    const payload = new URLSearchParams({
      "variables": JSON.stringify({ count: 500 }),
      "doc_id": "4247956801971754", // "FriendingCometFriendRequestsRootQueryRelayPreloader" — public doc_id
      "fb_dtsg": fb_dtsg
    });

    const https = require("https");

    const raw = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "www.facebook.com",
        path: "/api/graphql/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookieStr,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Origin": "https://www.facebook.com",
          "Referer": "https://www.facebook.com/friends/requests/",
          "Content-Length": Buffer.byteLength(payload.toString())
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.write(payload.toString());
      req.end();
    });

    // The response is JSONL (one JSON object per line)
    const lines = raw.split("\n").filter(l => l.trim().startsWith("{"));
    const results = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const edges =
          obj?.data?.viewer?.friending_possibilities?.edges ||
          obj?.data?.node?.friend_requests?.edges ||
          [];

        for (const edge of edges) {
          const node = edge?.node || {};
          const uid  = node.id || node.uid;
          const name = node.name || node.displayName || "Unknown";
          const profileUrl = node.profile_url || `https://www.facebook.com/${uid}`;
          if (uid) results.push({ uid, name, profileUrl });
        }
      } catch (_) {}
    }

    return results;

  } catch (err) {
    console.error("[fbcontrol] fetchFriendRequests error:", err.message);
    return [];
  }
}

/**
 * Fetch blocked users list.
 *
 * fca-riyad does NOT expose a native getBlockedUsers() API.
 * We use the Facebook block list page (/settings/blocking) with
 * the bot's session cookies. Returns an array of { uid, name, profileUrl }.
 */
async function fetchBlockedUsers(api) {
  try {
    const appState = api.getAppState();
    if (!Array.isArray(appState)) throw new Error("Cannot read appState.");
    const cookieStr = appState.map(c => `${c.key}=${c.value}`).join("; ");

    const https = require("https");

    const raw = await new Promise((resolve, reject) => {
      https.get({
        hostname: "www.facebook.com",
        path: "/settings/blocking",
        headers: {
          "Cookie": cookieStr,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html"
        }
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });

    // Parse blocked users from HTML (look for profile links in the blocking section)
    const blocked = [];
    const regex = /href="https?:\/\/(?:www\.)?facebook\.com\/([^"?]+)[^"]*"\s[^>]*>\s*([^<]{2,60})<\/a>/g;
    const uidRegex = /\/settings\/blocking\?uid=(\d+)/g;

    // Try to find uid= links directly (more reliable)
    let uidMatch;
    const seenUIDs = new Set();
    while ((uidMatch = uidRegex.exec(raw)) !== null) {
      const uid = uidMatch[1];
      if (seenUIDs.has(uid)) continue;
      seenUIDs.add(uid);
      // Find name near this UID in the HTML
      const surroundingHtml = raw.substring(Math.max(0, uidMatch.index - 300), uidMatch.index + 300);
      const nameMatch = surroundingHtml.match(/<a[^>]+>([A-Z][a-zA-Z\s'àáâãäåèéêëìíîïòóôõöùúûüÀ-ÖØ-öø-ÿ]+)<\/a>/);
      const name = nameMatch ? nameMatch[1].trim() : `User ${uid}`;
      blocked.push({ uid, name, profileUrl: `https://www.facebook.com/${uid}` });
    }

    return blocked;

  } catch (err) {
    console.error("[fbcontrol] fetchBlockedUsers error:", err.message);
    return [];
  }
}

/**
 * Fetch inbox / recent conversations using the native fca-riyad API.
 */
async function fetchInbox(api) {
  try {
    // Get recent USER (non-group) threads from the INBOX folder
    const all = await api.getThreadList(50, null, ["INBOX"]);
    // Prefer individual DM conversations (non-subscribed = non-group)
    const dms = (all || []).filter(t => !t.isGroup && t.isSubscribed !== false);
    return dms.slice(0, 100).map(t => ({
      threadID: t.threadID,
      name: t.name || t.threadID,
      snippet: t.snippet || ""
    }));
  } catch (err) {
    console.error("[fbcontrol] fetchInbox error:", err.message);
    return [];
  }
}

// ──────────────────────────────────────────────────────────
//  SEND MENU HELPER (sends the menu and registers reply)
// ──────────────────────────────────────────────────────────

/**
 * Sends a rendered menu message and registers a replyManager entry
 * for the command, plus stores the lastMsgID in the session.
 */
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
      // Store lastMsgID in session for reaction navigation
      const session = sessionGet(authorID);
      if (session) session.lastMsgID = sentMsgID;
      resolve(sentMsgID);
    }, messageID);
  });
}

// ──────────────────────────────────────────────────────────
//  COMMAND EXPORT
// ──────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "fbcontrol",
    // Aliases — "fb" is short and easy to type.
    // NOTE: if you also have inbox.js with alias "in", you can
    //       add "in" here as well — but remove it from inbox.js first
    //       to avoid a conflict.
    aliases: ["fb", "fbc", "fbm"],
    version: "1.0.0",
    author: "Riyad Bot Team",
    countDown: 5,
    role: 0,               // 0 = all users; 1 = group admin; 2 = bot admin
    category: "utility",
    description: "Complete Facebook Account Manager: friend requests, friends list, block list, inbox, and DM sending.",
    guide: [
      "{pn}           → Friend Request Manager",
      "{pn} list      → Friends List",
      "{pn} block     → Block List",
      "{pn} inbox     → Recent Inbox",
      "{pn} sms <n> <text>    → Send DM to friend #n",
      "{pn} sms all <text>    → Broadcast to all friends"
    ].join("\n")
  },

  // ─────────────────────────────────────────────
  //  onStart — command entry point
  // ─────────────────────────────────────────────
  onStart: async function ({ api, event, args, replyManager }) {
    const { threadID, messageID, senderID } = event;
    const sub = (args[0] || "").toLowerCase();

    const hasReaction = typeof api.setMessageReaction === "function";

    // Loading reaction
    if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

    try {

      // ── SEND MESSAGE (fb sms) ──────────────────────────────
      if (sub === "sms") {
        await handleSms(api, event, args, threadID, messageID, senderID, hasReaction);
        return;
      }

      // ── FRIEND REQUESTS (fb) ─────────────────────────────
      if (!sub || sub === "req" || sub === "request") {
        const loading = await api.sendMessage("⏳ Fetching pending friend requests...", threadID);

        const requests = await fetchFriendRequests(api);

        if (requests.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          return api.sendMessage(
            "📩 No pending friend requests found.\n\n" +
            "Note: If this is unexpected, Facebook may have changed\n" +
            "their internal API. Check bot logs for details.",
            threadID, messageID
          );
        }

        sessionCreate(senderID, "req", requests, threadID);
        const text = buildReqMenu(requests, 0);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        await sendMenu(api, threadID, messageID, text, senderID, module.exports.config.name, replyManager);
        return;
      }

      // ── FRIENDS LIST (fb list) ────────────────────────────
      if (sub === "list") {
        const loading = await api.sendMessage("⏳ Fetching friends list...", threadID);
        let friends = await api.getFriendsList();
        if (!friends || friends.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          return api.sendMessage("👥 Friends list is empty or could not be fetched.", threadID, messageID);
        }

        // Sort A-Z by default
        friends = friends.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

        sessionCreate(senderID, "list", friends, threadID);
        const text = buildListMenu(friends, 0);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        await sendMenu(api, threadID, messageID, text, senderID, module.exports.config.name, replyManager);
        return;
      }

      // ── BLOCK LIST (fb block) ─────────────────────────────
      if (sub === "block") {
        const loading = await api.sendMessage("⏳ Fetching block list...", threadID);
        const blocked = await fetchBlockedUsers(api);

        if (blocked.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          return api.sendMessage(
            "🚫 Block list is empty or could not be fetched.\n\n" +
            "Note: fca-riyad does not have a native getBlockedUsers() API.\n" +
            "This command reads the block list from Facebook's Settings page.\n" +
            "If it returns empty, Facebook's HTML layout may have changed.",
            threadID, messageID
          );
        }

        sessionCreate(senderID, "block", blocked, threadID);
        const text = buildBlockMenu(blocked, 0);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        await sendMenu(api, threadID, messageID, text, senderID, module.exports.config.name, replyManager);
        return;
      }

      // ── INBOX (fb inbox) ──────────────────────────────────
      if (sub === "inbox") {
        const loading = await api.sendMessage("⏳ Fetching inbox...", threadID);
        const threads = await fetchInbox(api);

        if (threads.length === 0) {
          if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
          return api.sendMessage("📨 Inbox is empty or could not be fetched.", threadID, messageID);
        }

        sessionCreate(senderID, "inbox", threads, threadID);
        const text = buildInboxMenu(threads, 0);
        if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
        await sendMenu(api, threadID, messageID, text, senderID, module.exports.config.name, replyManager);
        return;
      }

      // ── UNKNOWN SUB-COMMAND ───────────────────────────────
      if (hasReaction) api.setMessageReaction("❓", messageID, () => {}, true);
      return api.sendMessage(
        `❓ Unknown sub-command: "${args[0]}"\n\n` +
        `Valid commands:\n` +
        `  fb          → Friend Requests\n` +
        `  fb list     → Friends List\n` +
        `  fb block    → Block List\n` +
        `  fb inbox    → Inbox\n` +
        `  fb sms <n> <text>   → Send DM\n` +
        `  fb sms all <text>   → Broadcast DM`,
        threadID, messageID
      );

    } catch (err) {
      console.error("[fbcontrol] onStart error:", err);
      if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
      return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
    }
  },

  // ─────────────────────────────────────────────
  //  onReply — handle all text reply controls
  // ─────────────────────────────────────────────
  onReply: async function ({ api, event, Reply, replyManager }) {
    const { threadID, messageID, senderID, body } = event;
    const { author } = Reply;

    // Only the user who opened the session can control it
    if (String(senderID) !== String(author)) return;

    const session = sessionGet(author);
    if (!session) {
      return api.sendMessage("⏱️ Session expired. Run the command again.", threadID, messageID);
    }

    const hasReaction = typeof api.setMessageReaction === "function";
    const input = (body || "").trim().toLowerCase();

    sessionResetTimer(author);

    // ── EXIT ─────────────────────────────────────────────
    if (input === "q" || input === "exit" || input === "quit") {
      sessionClear(author);
      return api.sendMessage("👋 Menu closed. Goodbye!", threadID, messageID);
    }

    // ── PREVIOUS PAGE ─────────────────────────────────────
    if (input === "0") {
      if (session.page <= 0) {
        return api.sendMessage("⚠️ You are already on the first page.", threadID, messageID);
      }
      session.page--;
      return await refreshMenu(api, session, threadID, messageID, author, replyManager);
    }

    // ── NEXT PAGE (text "next" in addition to reaction) ──
    if (input === "next" || input === "n") {
      const tp = totalPages(session.data);
      if (session.page >= tp - 1) {
        return api.sendMessage("⚠️ You are already on the last page.", threadID, messageID);
      }
      session.page++;
      return await refreshMenu(api, session, threadID, messageID, author, replyManager);
    }

    // ── SEARCH (list only): s <name> ──────────────────────
    if (input.startsWith("s ") && session.type === "list") {
      const query = input.slice(2).trim().toLowerCase();
      if (!query) return api.sendMessage("⚠️ Please provide a search term. Example: s Rahim", threadID, messageID);

      const originalData = session.data;
      const results = originalData.filter(f =>
        (f.fullName || "").toLowerCase().includes(query)
      );
      if (results.length === 0) {
        return api.sendMessage(`🔍 No friends found matching "${query}".`, threadID, messageID);
      }
      // Temporarily show search results in a sub-session (same session, filtered data)
      const searchSession = { ...session, data: results, page: 0 };
      const text = buildListMenu(results, 0) + `\n\n🔍 Search results for "${query}" (${results.length} found)`;
      return api.sendMessage(text, threadID, (err, info) => {
        if (!err && info?.messageID && replyManager) {
          replyManager.set(info.messageID, { commandName: module.exports.config.name, author, type: "menu" });
          session.lastMsgID = info.messageID;
        }
      }, messageID);
    }

    // ── SORT (list only): sort az / sort new ─────────────
    if (input.startsWith("sort ") && session.type === "list") {
      const sortType = input.slice(5).trim();
      if (sortType === "az") {
        session.data = session.data.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        session.page = 0;
        await api.sendMessage("🔤 Sorted A-Z.", threadID, messageID);
        return await refreshMenu(api, session, threadID, messageID, author, replyManager);
      } else if (sortType === "new" || sortType === "newest") {
        // Friends list from getFriendsList doesn't carry a timestamp,
        // so "newest" reverses the API order (most recently added last in FB's list)
        session.data = session.data.slice().reverse();
        session.page = 0;
        await api.sendMessage("🕒 Sorted by newest.", threadID, messageID);
        return await refreshMenu(api, session, threadID, messageID, author, replyManager);
      } else {
        return api.sendMessage('⚠️ Unknown sort. Use "sort az" or "sort new".', threadID, messageID);
      }
    }

    // ── BULK ACTIONS ──────────────────────────────────────
    if (input.startsWith("bulk ")) {
      return await handleBulk(api, event, session, input, threadID, messageID, author, replyManager, hasReaction);
    }

    // ── NUMBERED ITEM ACTIONS: e.g. "1a", "3uf", "2msg" ──
    const actionMatch = input.match(/^(\d+)(a|d|b|uf|bl|u|msg)$/);
    if (actionMatch) {
      const num   = parseInt(actionMatch[1], 10);
      const action = actionMatch[2];

      const absoluteIndex = session.page * PER_PAGE + num - 1;
      const item = session.data[absoluteIndex];

      if (!item) {
        return api.sendMessage(
          `⚠️ No item #${num} on this page. There are ${Math.min(PER_PAGE, session.data.length - session.page * PER_PAGE)} items on page ${session.page + 1}.`,
          threadID, messageID
        );
      }

      return await handleItemAction(api, session, item, action, num, absoluteIndex, threadID, messageID, author, replyManager, hasReaction);
    }

    // ── UNKNOWN REPLY ────────────────────────────────────
    return api.sendMessage(
      "⚠️ Invalid input. Reply with:\n" +
      "  <n>a / <n>d / <n>b / <n>uf / <n>bl / <n>u / <n>msg\n" +
      "  bulk a / bulk d / bulk b / bulk uf / bulk bl / bulk u\n" +
      "  s <name> | sort az | sort new | 0 = Prev | q = Exit\n" +
      "  React ❤️ = Next Page",
      threadID, messageID
    );
  },

  // ─────────────────────────────────────────────
  //  onReaction — ❤️ react = next page
  // ─────────────────────────────────────────────
  onReaction: async function ({ api, event, Reaction, replyManager }) {
    const { threadID, messageID, userID, reaction, messageReaction } = event;

    // Only ❤️ / heart reactions trigger next page
    // reaction can be "❤️", "😍", "😮", "😢", "😡", "👍", "🎉" in Messenger
    const isNextPageReaction = reaction === "❤️" || reaction === "\u2764\uFE0F" || reaction === "love";
    if (!isNextPageReaction) return;

    const session = sessionGet(userID);
    if (!session) return; // No active session for this user
    if (String(session.threadID) !== String(threadID)) return; // Wrong thread

    // Only author can navigate
    if (String(userID) !== String(session.authorID)) return;

    const tp = totalPages(session.data);
    if (session.page >= tp - 1) {
      return api.sendMessage("📄 You are on the last page.", threadID);
    }

    session.page++;
    sessionResetTimer(session.authorID);
    await refreshMenu(api, session, threadID, null, session.authorID, replyManager);
  }
};

// ──────────────────────────────────────────────────────────
//  INTERNAL HELPERS (not exported)
// ──────────────────────────────────────────────────────────

/**
 * Re-render and send the current page of the active session.
 */
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

/**
 * Handle a single numbered item action: a, d, b, uf, bl, u, msg
 */
async function handleItemAction(api, session, item, action, displayNum, absoluteIndex, threadID, messageID, authorID, replyManager, hasReaction) {
  const uid       = item.uid || item.userID;
  const name      = item.name || item.fullName || "Unknown";
  const sessionID = authorID;

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

  try {
    // ── ACCEPT FRIEND REQUEST ────────────────────────────
    if (action === "a" && session.type === "req") {
      await api.handleFriendRequest(uid, true);
      // Remove from list so it doesn't show again on refresh
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`✅ Accepted friend request from ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── DELETE / REJECT FRIEND REQUEST ───────────────────
    if (action === "d" && session.type === "req") {
      await api.handleFriendRequest(uid, false);
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`❌ Deleted friend request from ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── BLOCK (from request or friends list) ─────────────
    if (action === "b" && (session.type === "req" || session.type === "list")) {
      await api.changeBlockedStatus(uid, true);
      if (session.type === "req") {
        // Also delete the request after blocking
        try { await api.handleFriendRequest(uid, false); } catch (_) {}
      }
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`🚫 Blocked ${name} successfully.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── UNFRIEND ─────────────────────────────────────────
    if (action === "uf" && session.type === "list") {
      await api.unfriend(uid);
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`❌ Unfriended ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── BLOCK FRIEND (from friends list) ──────────────────
    if (action === "bl" && session.type === "list") {
      await api.changeBlockedStatus(uid, true);
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`🚫 Blocked ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── UNBLOCK ───────────────────────────────────────────
    if (action === "u" && session.type === "block") {
      await api.changeBlockedStatus(uid, false);
      session.data.splice(absoluteIndex, 1);
      if (session.page > 0 && session.page >= totalPages(session.data)) session.page--;
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      await api.sendMessage(`✅ Unblocked ${name}.`, threadID, messageID);
      return await refreshMenu(api, session, threadID, null, authorID, replyManager);
    }

    // ── SEND MESSAGE / OPEN CONVERSATION ─────────────────
    if (action === "msg") {
      const targetThreadID = item.threadID || uid; // DM thread ID = recipient UID
      await api.sendMessage(`💬 Opening conversation with ${name}...\nUID: ${uid}`, threadID, messageID);
      await api.sendMessage(`👋 This is a message from your bot. Hi, ${name}!`, targetThreadID);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      return;
    }

    // ── Invalid action for this session type
    if (hasReaction) api.setMessageReaction("❓", messageID, () => {}, true);
    return api.sendMessage(`⚠️ Action "${action}" is not valid in the current menu (${session.type}).`, threadID, messageID);

  } catch (err) {
    console.error("[fbcontrol] handleItemAction error:", err);
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(`❌ Action failed: ${err.message}`, threadID, messageID);
  }
}

/**
 * Handle bulk actions with confirmation step.
 */
async function handleBulk(api, event, session, input, threadID, messageID, authorID, replyManager, hasReaction) {
  const { type, data, page } = session;
  const cmd = input.slice(5).trim(); // e.g. "a", "d", "b", "uf", "bl", "u"

  // Validate action vs. session type
  const validActions = {
    req:   ["a", "d", "b"],
    list:  ["uf", "bl"],
    block: ["u"],
    inbox: []
  };
  const allowed = validActions[type] || [];

  if (!allowed.includes(cmd)) {
    const valid = allowed.map(a => `bulk ${a}`).join(", ") || "none";
    return api.sendMessage(`⚠️ Bulk action "${cmd}" is not valid here.\nAllowed: ${valid}`, threadID, messageID);
  }

  const actionLabels = {
    a:  "Accept All Friend Requests",
    d:  "Delete All Friend Requests",
    b:  "Block All Requesters",
    uf: "Unfriend ALL Friends",
    bl: "Block ALL Friends",
    u:  "Unblock ALL Blocked Users"
  };
  const label = actionLabels[cmd] || cmd;

  // ── Confirmation step ────────────────────────────────
  const confirmMsg = `⚠️ 𝗕𝗨𝗟𝗞 𝗔𝗖𝗧𝗜𝗢𝗡 𝗖𝗢𝗡𝗙𝗜𝗥𝗠𝗔𝗧𝗜𝗢𝗡\n${DIVIDER}\n` +
    `Action: ${label}\n` +
    `Total items: ${data.length}\n\n` +
    `Reply YES to confirm.\nReply NO to cancel.\n\n⚠️ This cannot be undone!`;

  return api.sendMessage(confirmMsg, threadID, (err, info) => {
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
  }, messageID);
}

/**
 * Handle the confirmed bulk confirmation reply (YES/NO).
 * This is dispatched from onReply when Reply.type === "bulk_confirm".
 */
async function executeBulkAction(api, event, Reply, session, replyManager) {
  const { threadID, messageID, senderID, body } = event;
  const hasReaction = typeof api.setMessageReaction === "function";
  const input = (body || "").trim().toLowerCase();

  if (input !== "yes" && input !== "confirm") {
    return api.sendMessage("🚫 Bulk action cancelled.", threadID, messageID);
  }

  const { bulkCmd } = Reply;
  const items = session.data.slice(); // copy
  let success = 0;
  let failed  = 0;

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
  await api.sendMessage(`📤 Starting bulk action on ${items.length} items...`, threadID, messageID);

  for (const item of items) {
    const uid = item.uid || item.userID;
    try {
      if (bulkCmd === "a") await api.handleFriendRequest(uid, true);
      else if (bulkCmd === "d") await api.handleFriendRequest(uid, false);
      else if (bulkCmd === "b") {
        await api.changeBlockedStatus(uid, true);
        try { await api.handleFriendRequest(uid, false); } catch (_) {}
      }
      else if (bulkCmd === "uf") await api.unfriend(uid);
      else if (bulkCmd === "bl") await api.changeBlockedStatus(uid, true);
      else if (bulkCmd === "u")  await api.changeBlockedStatus(uid, false);
      success++;
    } catch (err) {
      console.error(`[fbcontrol] bulk error on ${uid}:`, err.message);
      failed++;
    }
    // Small delay between FB calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  // Clear the session data since we processed everything
  session.data = [];
  session.page = 0;

  if (hasReaction) api.setMessageReaction(failed === 0 ? "✅" : "⚠️", messageID, () => {}, true);
  return api.sendMessage(
    `📊 𝗕𝘂𝗹𝗸 𝗔𝗰𝘁𝗶𝗼𝗻 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲\n${DIVIDER}\n` +
    `✔ Success: ${success}\n❌ Failed:  ${failed}\n\n` +
    (failed > 0 ? "Some items failed. Check logs for details.\n" : "") +
    "Menu closed. Run the command again to refresh.",
    threadID, messageID
  );
}

/**
 * Handle the fb sms sub-command.
 * Usage:
 *   fb sms <n> <text>     — send to friend #n
 *   fb sms all <text>     — broadcast to all friends
 */
async function handleSms(api, event, args, threadID, messageID, senderID, hasReaction) {
  const target  = args[1] || "";   // "all" or a number string
  const msgText = args.slice(2).join(" ");

  if (!target || !msgText) {
    return api.sendMessage(
      "⚠️ Usage:\n  fb sms <n> <text>      — DM friend #n\n  fb sms all <text>    — Broadcast to all friends",
      threadID, messageID
    );
  }

  if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

  let friends;
  try {
    friends = await api.getFriendsList();
  } catch (err) {
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(`❌ Could not fetch friends list: ${err.message}`, threadID, messageID);
  }

  if (!friends || friends.length === 0) {
    if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
    return api.sendMessage("👥 Friends list is empty.", threadID, messageID);
  }

  // Sort A-Z to match the list menu numbering
  friends = friends.slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  // ── BROADCAST TO ALL ──────────────────────────────────
  if (target.toLowerCase() === "all") {
    await api.sendMessage(
      `📤 Sending message to all ${friends.length} friends...\n"${msgText}"`,
      threadID, messageID
    );

    let success = 0;
    let failed  = 0;

    for (const friend of friends) {
      const recipientID = friend.userID;
      try {
        await api.sendMessage(msgText, recipientID);
        success++;
      } catch (err) {
        console.error(`[fbcontrol] sms all failed for ${recipientID}:`, err.message);
        failed++;
      }
      // Progress update every 10 successful sends
      if ((success + failed) % 10 === 0) {
        await api.sendMessage(
          `⏳ Progress: ${success + failed}/${friends.length}  ✔ ${success}  ❌ ${failed}`,
          threadID
        );
      }
      await new Promise(r => setTimeout(r, 500)); // Rate limiting
    }

    if (hasReaction) api.setMessageReaction(failed === 0 ? "✅" : "⚠️", messageID, () => {}, true);
    return api.sendMessage(
      `📊 𝗕𝗿𝗼𝗮𝗱𝗰𝗮𝘀𝘁 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲\n${DIVIDER}\n` +
      `✔ Success: ${success}\n❌ Failed:  ${failed}\n\nCompleted.`,
      threadID, messageID
    );
  }

  // ── SEND TO FRIEND #n ─────────────────────────────────
  const idx = parseInt(target, 10);
  if (isNaN(idx) || idx < 1 || idx > friends.length) {
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(
      `⚠️ Invalid friend number: "${target}"\nYou have ${friends.length} friends. Use a number between 1 and ${friends.length}.`,
      threadID, messageID
    );
  }

  const friend     = friends[idx - 1];
  const recipientID = friend.userID;
  const friendName = friend.fullName || "Friend";

  try {
    await api.sendMessage(msgText, recipientID);
    if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
    return api.sendMessage(
      `✅ Message sent to ${friendName} (#${idx}).\n💬 "${msgText}"`,
      threadID, messageID
    );
  } catch (err) {
    console.error(`[fbcontrol] sms send error:`, err.message);
    if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
    return api.sendMessage(
      `❌ Failed to send message to ${friendName}: ${err.message}`,
      threadID, messageID
    );
  }
}

// ──────────────────────────────────────────────────────────
//  PATCH onReply to also handle bulk_confirm replies
//  (we need access to the inner function executeBulkAction)
// ──────────────────────────────────────────────────────────
const _onReply = module.exports.onReply;
module.exports.onReply = async function (ctx) {
  const { api, event, Reply, replyManager } = ctx;

  // Route bulk_confirm replies to the executor
  if (Reply && Reply.type === "bulk_confirm") {
    // Verify it is the same author
    if (String(event.senderID) !== String(Reply.author)) return;
    const session = sessionGet(Reply.sessionAuthorID);
    if (!session) {
      return api.sendMessage("⏱️ Session expired. Start over.", event.threadID, event.messageID);
    }
    return executeBulkAction(api, event, Reply, session, replyManager);
  }

  // Default onReply handler
  return _onReply.call(this, ctx);
};
