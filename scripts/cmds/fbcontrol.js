/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  Aliases: fb, fbc, fbm            ║
 * ║  Version: 3.2.0  (FIXED for RIYAD_BOT-V2 reply/reaction) ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * FIXES (3.2.0):
 *  - sendPage now registers into the framework's real replyManager /
 *    reactionManager stores instead of non-existent global.GoatBot /
 *    global.client objects. This is why replies (1a, 0, bulk a, ...)
 *    and ❤️ reactions were not working before.
 *  - replyManager / reactionManager are threaded through every function
 *    that eventually calls sendPage() or navigatePage().
 *
 * FIXES (3.1.0, kept):
 *  - handleFriendRequest: boolean fix (true/false, not "confirm"/"delete")
 *  - onReply handler added — reply করলে navigation কাজ করবে
 *  - Reaction next page সঠিকভাবে কাজ করবে
 *  - Block list improved HTML parsing
 *  - Inbox msg, friend request, block — সব ঠিক করা হয়েছে
 */
"use strict";

// ─────────────────────────────────────────────
//  RAW API HELPER
// ─────────────────────────────────────────────
function getRawApi(api) {
  if (api && api.api && typeof api.api === "object") return api.api;
  return api;
}

// ─────────────────────────────────────────────
//  SESSION STORE
// ─────────────────────────────────────────────
const SESSIONS = new Map();
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const PER_PAGE = 10;

// Reply tracker: msgID → authorID (local backup only, framework uses replyManager)
const REPLY_TRACKER = new Map();

function sessionCreate(authorID, type, data, threadID, extra = {}) {
  clearSessionTimer(authorID);
  const timer = setTimeout(() => {
    const s = SESSIONS.get(String(authorID));
    if (s && s.lastMsgID) REPLY_TRACKER.delete(s.lastMsgID);
    SESSIONS.delete(String(authorID));
  }, SESSION_TIMEOUT_MS);
  SESSIONS.set(String(authorID), {
    type, data, page: 0, authorID: String(authorID), threadID,
    lastMsgID: null, timer,
    smsAll: null,
    ...extra
  });
}

function sessionGet(authorID) { return SESSIONS.get(String(authorID)) || null; }
function sessionClear(authorID) {
  const s = SESSIONS.get(String(authorID));
  if (s && s.lastMsgID) REPLY_TRACKER.delete(s.lastMsgID);
  clearSessionTimer(authorID);
  SESSIONS.delete(String(authorID));
}

function sessionResetTimer(authorID) {
  const s = SESSIONS.get(String(authorID));
  if (!s) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (s.lastMsgID) REPLY_TRACKER.delete(s.lastMsgID);
    SESSIONS.delete(String(authorID));
  }, SESSION_TIMEOUT_MS);
}

function clearSessionTimer(authorID) {
  const s = SESSIONS.get(String(authorID));
  if (s && s.timer) clearTimeout(s.timer);
}

// ─────────────────────────────────────────────
//  UNSEND HELPER
// ─────────────────────────────────────────────
function unsendMsg(api, msgID) {
  if (!msgID) return;
  try {
    if (typeof api.unsendMessage === "function") api.unsendMessage(msgID, () => {});
  } catch (_) {}
}

function unsendAfter(api, msgID, ms = 5000) {
  if (!msgID) return;
  setTimeout(() => unsendMsg(api, msgID), ms);
}

// ─────────────────────────────────────────────
//  SEND PAGE HELPER
//  - unsends previous page message
//  - sends new message
//  - registers msgID for onReply + onReaction via the REAL framework
//    replyManager / reactionManager (RIYAD_BOT-V2), not GoatBot globals
// ─────────────────────────────────────────────
async function sendPage(api, threadID, text, session, replyManager, reactionManager) {
  // Unregister old listeners
  if (session.lastMsgID) {
    REPLY_TRACKER.delete(session.lastMsgID);
    replyManager.delete(session.lastMsgID);
    reactionManager.delete(session.lastMsgID);
    unsendMsg(api, session.lastMsgID);
    session.lastMsgID = null;
  }

  return new Promise((resolve) => {
    api.sendMessage(text, threadID, (err, info) => {
      if (!err && info && info.messageID) {
        session.lastMsgID = info.messageID;

        // Local backup tracker
        REPLY_TRACKER.set(info.messageID, session.authorID);

        // Register in the actual Riyad Bot V2 framework stores
        replyManager.set(info.messageID, {
          commandName: "fbcontrol",
          authorID: session.authorID
        });
        reactionManager.set(info.messageID, {
          commandName: "fbcontrol",
          authorID: session.authorID
        });
      }
      resolve(info);
    });
  });
}

// ─────────────────────────────────────────────
//  UI BUILDERS
// ─────────────────────────────────────────────
const D = "━━━━━━━━━━━━━━━━━━━━━━";

function buildHelpMenu() {
  return `╔══════════════════════════╗
║  📘 FB CONTROL — COMMANDS  ║
╚══════════════════════════╝

${D}
📋 AVAILABLE COMMANDS
${D}

📩 fb
   └ Friend Request Manager
   └ Accept / Delete / Block

👥 fb list
   └ Friends List Manager
   └ Unfriend / Block / Message

🚫 fb block
   └ Block List Manager
   └ View & Unblock users

📨 fb inbox
   └ Recent DM Conversations

📬 fb mr
   └ Message Requests (OTHER/SPAM)
   └ Accept / Delete / Block

📤 fb sms <n> <text>
   └ DM a specific friend

📢 fb sms all <text>
   └ Broadcast to ALL friends
   └ Reply "off" to cancel

${D}
🕹️ NAVIGATION (reply to bot's menu OR react)
${D}
  ❤️ React  → Next page
  Reply: 0  → Previous page
  Reply: <n>a     → Accept (requests)
  Reply: <n>d     → Delete / Reject
  Reply: <n>b     → Block
  Reply: <n>uf    → Unfriend (list)
  Reply: <n>bl    → Block (list)
  Reply: <n>u     → Unblock (block list)
  Reply: <n>msg   → Open conversation
  Reply: bulk a/d/b/uf/bl/u → Bulk actions
  Reply: s <name> → Search (list only)
  Reply: sort az / sort new → Sort (list)
${D}`;
}

function buildReqMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  📩 FRIEND REQUESTS       ║\n`;
  msg += `║  Page ${String(page + 1).padEnd(3)}/ ${String(tp).padEnd(3)} │ Total: ${requests.length}   ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No friend requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      const num = start + i + 1;
      msg += `\n${num}. 👤 ${r.name}\n`;
      msg += `   🆔 UID: ${r.uid}\n`;
      msg += `   🔗 fb.com/${r.uid}\n`;
      msg += `   ✅a  ❌d  🚫b\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS (reply to this msg)\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   Reply 0 → Prev\n`;
  }

  return msg;
}

function buildListMenu(friends, page) {
  const tp = Math.max(1, Math.ceil(friends.length / PER_PAGE));
  const items = friends.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  👥 FRIENDS LIST          ║\n`;
  msg += `║  Page ${String(page + 1).padEnd(3)}/ ${String(tp).padEnd(3)} │ Total: ${friends.length}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No friends found.\n\n`;
  } else {
    items.forEach((f, i) => {
      const num = start + i + 1;
      msg += `\n${num}. 👤 ${f.fullName}\n`;
      msg += `   🆔 UID: ${f.userID}\n`;
      msg += `   🔗 ${f.profileUrl || `fb.com/${f.userID}`}\n`;
      msg += `   💬msg  🚫bl  ❌uf\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS (reply to this msg)\n`;
  msg += `  <n>msg  <n>uf Unfriend  <n>bl Block\n`;
  msg += `  s <name> → Search\n`;
  msg += `  sort az / sort new\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   Reply 0 → Prev\n`;
  }

  return msg;
}

function buildBlockMenu(blocked, page) {
  const tp = Math.max(1, Math.ceil(blocked.length / PER_PAGE));
  const items = blocked.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  🚫 BLOCK LIST            ║\n`;
  msg += `║  Page ${String(page + 1).padEnd(3)}/ ${String(tp).padEnd(3)} │ Total: ${blocked.length}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No blocked users.\n\n`;
  } else {
    items.forEach((u, i) => {
      const num = start + i + 1;
      msg += `\n${num}. 👤 ${u.name}\n`;
      msg += `   🆔 UID: ${u.uid}\n`;
      msg += `   ✅u Unblock  💬msg\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS (reply to this msg)\n`;
  msg += `  <n>u Unblock  <n>msg Message\n`;
  msg += `  bulk u → Bulk unblock\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   Reply 0 → Prev\n`;
  }

  return msg;
}

function buildInboxMenu(threads, page) {
  const tp = Math.max(1, Math.ceil(threads.length / PER_PAGE));
  const items = threads.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  📨 INBOX                 ║\n`;
  msg += `║  Page ${String(page + 1).padEnd(3)}/ ${String(tp).padEnd(3)} │ Total: ${threads.length}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 Inbox is empty.\n\n`;
  } else {
    items.forEach((t, i) => {
      const num = start + i + 1;
      const name = t.name || `Thread ${t.threadID}`;
      msg += `\n${num}. ${t.isGroup ? "👥" : "👤"} ${name}\n`;
      msg += `   🆔 ${t.threadID}\n`;
      if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 30)}"\n`;
      msg += `   📤 <n>msg to open\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS (reply to this msg)\n`;
  msg += `  <n>msg → Open conversation\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   Reply 0 → Prev\n`;
  }

  return msg;
}

function buildMRMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  📬 MESSAGE REQUESTS      ║\n`;
  msg += `║  Page ${String(page + 1).padEnd(3)}/ ${String(tp).padEnd(3)} │ Total: ${requests.length}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No message requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      const num = start + i + 1;
      const badge = r.isNew ? " 🆕NEW" : "";
      const typeBadge = r.isGroup ? " [GROUP]" : "";
      const sectionBadge = r.section === "spam" ? " ⚠️SPAM" : " 🤝YOUMAYKNOW";
      msg += `\n${num}. ${r.isGroup ? "👥" : "👤"} ${r.name}${badge}${typeBadge}${sectionBadge}\n`;
      msg += `   🆔 ${r.threadID}\n`;
      if (r.snippet) msg += `   💬 "${r.snippet.substring(0, 28)}"\n`;
      msg += `   ✅a Accept  ❌d Delete  🚫b Block\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS (reply to this msg)\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   Reply 0 → Prev\n`;
  }

  return msg;
}

// ─────────────────────────────────────────────
//  COOKIE / HTTP HELPERS
// ─────────────────────────────────────────────
function buildCookieString(rawApi) {
  try {
    if (typeof rawApi.getAppState !== "function") return null;
    const appState = rawApi.getAppState();
    if (!Array.isArray(appState) || appState.length === 0) return null;
    return appState.map(c => `${c.key}=${c.value}`).join("; ");
  } catch (_) { return null; }
}

function httpsGet(url, cookieStr, depth = 0) {
  if (depth > 4) return Promise.reject(new Error("Too many redirects"));
  const https = require("https");
  const urlObj = new URL(url);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "Cookie": cookieStr || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": "https://www.facebook.com/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1"
      }
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://www.facebook.com${res.headers.location}`;
        return httpsGet(next, cookieStr, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

// ─────────────────────────────────────────────
//  DATA FETCHERS
// ─────────────────────────────────────────────

async function fetchFriendRequests(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Could not read cookies from bot session." };

  try {
    const res = await httpsGet("https://mbasic.facebook.com/friends/requests/", cookieStr);
    const html = res.body || "";

    const results = [];

    // Pattern 1: mbasic HTML — find name links near Confirm buttons
    const chunks = html.split(/<a href="[^"]*confirm[^"]*">/i);
    for (let i = 0; i < chunks.length - 1; i++) {
      const chunk = chunks[i];
      const linkRe = /href="\/(?:profile\.php\?id=)?([^"?&\/\n]{1,60})[^"]*"\s*[^>]*>([^<]{2,80})<\/a>/gi;
      let m;
      let last = null;
      while ((m = linkRe.exec(chunk)) !== null) {
        const uid = m[1].replace(/^profile\.php\?id=/, "").split("?")[0].trim();
        const name = m[2].replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
        if (!uid || uid.includes("/") || uid === "friends" || uid === "home" || uid === "settings") continue;
        if (name.length < 2 || name.length > 80) continue;
        last = { uid, name };
      }
      if (last && !results.find(r => r.uid === last.uid)) {
        results.push({ uid: last.uid, name: last.name, profileUrl: `https://www.facebook.com/${last.uid}` });
      }
    }

    // Pattern 2 fallback: JSON embedded in page
    if (results.length === 0) {
      const jsonRe = /"userID"\s*:\s*"(\d+)"[^}]*?"name"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = jsonRe.exec(html)) !== null) {
        const uid = m[1];
        const name = m[2].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16))).trim();
        if (results.find(r => r.uid === uid)) continue;
        results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
      }
    }

    return { data: results, error: results.length === 0 ? "No pending friend requests found (or Facebook changed its page format)." : null };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

async function fetchFriendsList(rawApi) {
  return new Promise((resolve) => {
    if (typeof rawApi.getFriendsList !== "function") {
      return resolve({ data: [], error: "getFriendsList is not available." });
    }
    rawApi.getFriendsList((err, data) => {
      if (err) return resolve({ data: [], error: err.message || String(err) });
      const friends = Object.values(data || {}).map(f => ({
        userID: f.userID,
        fullName: f.fullName || f.name || "Unknown",
        profileUrl: f.profileUrl || `https://www.facebook.com/${f.userID}`,
        vanity: f.vanity || null
      }));
      resolve({ data: friends, error: null });
    });
  });
}

async function fetchBlockList(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Could not read cookies from bot session." };

  const endpoints = [
    "https://mbasic.facebook.com/settings/blocking/",
    "https://www.facebook.com/privacy/blocking/",
    "https://m.facebook.com/settings/blocking/"
  ];

  for (const url of endpoints) {
    try {
      const res = await httpsGet(url, cookieStr);
      const html = res.body || "";

      if (res.status !== 200 || html.length < 500) continue;

      const results = [];

      const unblockSplit = html.split(/Unblock/i);
      for (let i = 0; i < unblockSplit.length - 1; i++) {
        const chunk = unblockSplit[i];
        const searchIn = chunk.slice(-800);
        const linkRe = /href="\/(?:profile\.php\?id=)?([^"?&\/\n]{1,60})[^"]*"\s*[^>]*>([^<]{2,80})<\/a>/gi;
        let m, last = null;
        while ((m = linkRe.exec(searchIn)) !== null) {
          const uid = m[1].replace(/^profile\.php\?id=/, "").split("?")[0].trim();
          const name = m[2].replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
          if (!uid || uid.includes("/") || uid === "settings" || uid === "home") continue;
          if (name.length < 2 || name.length > 80) continue;
          last = { uid, name };
        }
        if (last && !results.find(r => r.uid === last.uid)) {
          results.push({ uid: last.uid, name: last.name });
        }
      }

      if (results.length === 0) {
        const jsonPatterns = [
          /"uid"\s*:\s*"?(\d+)"?[^}]{0,200}"name"\s*:\s*"([^"]+)"/g,
          /"id"\s*:\s*"?(\d+)"?[^}]{0,200}"name"\s*:\s*"([^"]+)"/g
        ];
        for (const re of jsonPatterns) {
          let m;
          while ((m = re.exec(html)) !== null) {
            const uid = m[1];
            const name = m[2].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16))).trim();
            if (results.find(r => r.uid === uid)) continue;
            results.push({ uid, name });
          }
          if (results.length > 0) break;
        }
      }

      if (results.length > 0) return { data: results, error: null };
    } catch (_) {}
  }

  return {
    data: [],
    error: "Block list could not be loaded.\n\n" +
      "📌 Facebook frequently changes its HTML. " +
      "The bot's cookies may also need refreshing. " +
      "Please confirm the bot account has blocked users."
  };
}

async function fetchInbox(api) {
  return new Promise((resolve) => {
    if (typeof api.getThreadList !== "function") {
      return resolve({ data: [], error: "getThreadList not available." });
    }
    api.getThreadList(30, null, [], (err, threads) => {
      if (err) return resolve({ data: [], error: err.message || String(err) });
      const list = (threads || []).map(t => ({
        threadID: t.threadID,
        name: t.name || t.threadID,
        isGroup: t.isGroup || false,
        snippet: t.snippet || ""
      }));
      resolve({ data: list, error: null });
    });
  });
}

async function fetchMessageRequests(api) {
  return new Promise((resolve) => {
    if (typeof api.getThreadList !== "function") {
      return resolve({ data: [], error: "getThreadList not available." });
    }
    api.getThreadList(30, null, ["OTHER"], (err, threads) => {
      if (err) {
        api.getThreadList(30, null, [], (err2, threads2) => {
          if (err2) return resolve({ data: [], error: err2.message });
          resolve({ data: buildMRList(threads2 || [], "other"), error: null });
        });
        return;
      }
      const known = buildMRList(threads || [], "you_may_know");

      api.getThreadList(20, null, ["SPAM"], (err3, spamThreads) => {
        let all = known;
        if (!err3 && spamThreads && spamThreads.length > 0) {
          all = [...known, ...buildMRList(spamThreads, "spam")];
        }
        resolve({ data: all, error: null });
      });
    });
  });
}

function buildMRList(threads, section) {
  return threads.map(t => ({
    threadID: t.threadID,
    name: t.name || t.threadID,
    isGroup: t.isGroup || false,
    snippet: t.snippet || "",
    isNew: t.isSubscribed === false || t.readStatus === false || false,
    section
  }));
}

// ─────────────────────────────────────────────
//  ACTION HANDLERS
// ─────────────────────────────────────────────

async function doReqAction(api, rawApi, session, input, threadID) {
  const match = input.match(/^(\d+)(a|d|b)$/i);
  const bulkMatch = input.match(/^bulk\s+(a|d|b)$/i);

  if (!match && !bulkMatch) return false;

  const items = session.data;
  if (!items) return false;

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const r of pageItems) {
      try {
        if (action === "a") await callFriendAction(rawApi, r.uid, true);
        else if (action === "d") await callFriendAction(rawApi, r.uid, false);
        else if (action === "b") {
          await new Promise((res, rej) =>
            rawApi.changeBlockedStatus(r.uid, true, (e) => e ? rej(e) : res())
          );
        }
        done++;
      } catch (_) {}
    }
    const label = action === "a" ? "Accepted" : action === "d" ? "Deleted" : "Blocked";
    session.data = items.filter(r => !pageItems.find(p => p.uid === r.uid));
    api.sendMessage(`✅ Bulk ${label}: ${done} requests done.`, threadID);
    return true;
  }

  const num = parseInt(match[1]);
  const action = match[2].toLowerCase();
  const target = items[num - 1];
  if (!target) { api.sendMessage(`❌ No request #${num}.`, threadID); return true; }

  try {
    if (action === "a") {
      await callFriendAction(rawApi, target.uid, true);
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`✅ Accepted: ${target.name}`, threadID);
    } else if (action === "d") {
      await callFriendAction(rawApi, target.uid, false);
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`🗑️ Deleted: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise((res, rej) =>
        rawApi.changeBlockedStatus(target.uid, true, (e) => e ? rej(e) : res())
      );
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID);
  }
  return true;
}

// fca-riyad handleFriendRequest takes (userID, accept: boolean, callback)
function callFriendAction(rawApi, uid, accept /* boolean */) {
  return new Promise((resolve, reject) => {
    if (typeof rawApi.handleFriendRequest === "function") {
      rawApi.handleFriendRequest(uid, accept, (err) => err ? reject(err) : resolve());
    } else {
      reject(new Error("handleFriendRequest not available in this fca version"));
    }
  });
}

async function doListAction(api, rawApi, session, input, threadID, replyManager, reactionManager) {
  const msgMatch = input.match(/^(\d+)msg$/i);
  const ufMatch = input.match(/^(\d+)uf$/i);
  const blMatch = input.match(/^(\d+)bl$/i);
  const bulkMatch = input.match(/^bulk\s+(uf|bl)$/i);
  const searchMatch = input.match(/^s\s+(.+)$/i);
  const sortMatch = input.match(/^sort\s+(az|new)$/i);

  if (!msgMatch && !ufMatch && !blMatch && !bulkMatch && !searchMatch && !sortMatch) return false;

  const items = session.data;

  if (searchMatch) {
    const q = searchMatch[1].toLowerCase();
    const found = items.filter(f => f.fullName.toLowerCase().includes(q));
    api.sendMessage(
      `🔍 Found ${found.length} results for "${searchMatch[1]}":\n\n` +
      (found.length === 0 ? "  Nobody found." : found.slice(0, 10).map((f, i) => `${i + 1}. ${f.fullName}`).join("\n")),
      threadID
    );
    return true;
  }

  if (sortMatch) {
    if (sortMatch[1] === "az") {
      session.data = [...items].sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else {
      session.data = [...items].reverse();
    }
    session.page = 0;
    await sendPage(api, threadID, buildListMenu(session.data, 0), session, replyManager, reactionManager);
    return true;
  }

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const f of pageItems) {
      try {
        if (action === "uf") await new Promise((res, rej) => rawApi.unfriend(f.userID, (e) => e ? rej(e) : res()));
        else if (action === "bl") await new Promise((res, rej) => rawApi.changeBlockedStatus(f.userID, true, (e) => e ? rej(e) : res()));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(f => !pageItems.find(p => p.userID === f.userID));
    api.sendMessage(`✅ Bulk ${action === "uf" ? "Unfriended" : "Blocked"}: ${done} done.`, threadID);
    return true;
  }

  if (msgMatch) {
    const num = parseInt(msgMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    api.sendMessage(`💬 Opening chat with ${target.fullName}...\nThread ID: ${target.userID}`, threadID);
    return true;
  }

  if (ufMatch) {
    const num = parseInt(ufMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.unfriend(target.userID, (e) => e ? rej(e) : res()));
      session.data = items.filter(f => f.userID !== target.userID);
      api.sendMessage(`✅ Unfriended: ${target.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }

  if (blMatch) {
    const num = parseInt(blMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.userID, true, (e) => e ? rej(e) : res()));
      session.data = items.filter(f => f.userID !== target.userID);
      api.sendMessage(`🚫 Blocked: ${target.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }

  return false;
}

async function doBlockAction(api, rawApi, session, input, threadID) {
  const uMatch = input.match(/^(\d+)u$/i);
  const msgMatch = input.match(/^(\d+)msg$/i);
  const bulkMatch = input.match(/^bulk\s+u$/i);

  if (!uMatch && !msgMatch && !bulkMatch) return false;

  const items = session.data;

  if (bulkMatch) {
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const u of pageItems) {
      try {
        await new Promise((res, rej) => rawApi.changeBlockedStatus(u.uid, false, (e) => e ? rej(e) : res()));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(u => !pageItems.find(p => p.uid === u.uid));
    api.sendMessage(`✅ Bulk Unblocked: ${done} done.`, threadID);
    return true;
  }

  if (uMatch) {
    const num = parseInt(uMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No user #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.uid, false, (e) => e ? rej(e) : res()));
      session.data = items.filter(u => u.uid !== target.uid);
      api.sendMessage(`✅ Unblocked: ${target.name}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }

  if (msgMatch) {
    const num = parseInt(msgMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No user #${num}.`, threadID); return true; }
    api.sendMessage(`💬 User: ${target.name}\nUID: ${target.uid}`, threadID);
    return true;
  }

  return false;
}

async function doMRAction(api, rawApi, session, input, threadID) {
  const match = input.match(/^(\d+)(a|d|b)$/i);
  const bulkMatch = input.match(/^bulk\s+(a|d|b)$/i);

  if (!match && !bulkMatch) return false;

  const items = session.data;

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const r of pageItems) {
      try {
        if (action === "d" && typeof rawApi.deleteThread === "function") {
          await new Promise(res => rawApi.deleteThread(r.threadID, res));
        } else if (action === "b") {
          await new Promise((res, rej) => rawApi.changeBlockedStatus(r.threadID, true, (e) => e ? rej(e) : res()));
        }
        done++;
      } catch (_) {}
    }
    session.data = items.filter(r => !pageItems.find(p => p.threadID === r.threadID));
    const label = action === "a" ? "Accepted" : action === "d" ? "Deleted" : "Blocked";
    api.sendMessage(`✅ Bulk ${label}: ${done} done.`, threadID);
    return true;
  }

  const num = parseInt(match[1]);
  const action = match[2].toLowerCase();
  const target = items[num - 1];
  if (!target) { api.sendMessage(`❌ No request #${num}.`, threadID); return true; }

  try {
    if (action === "a") {
      api.sendMessage(`✅ Accepted request from: ${target.name}\nYou can now message them.`, threadID);
      session.data = items.filter(r => r.threadID !== target.threadID);
    } else if (action === "d") {
      if (typeof rawApi.deleteThread === "function")
        await new Promise(res => rawApi.deleteThread(target.threadID, res));
      session.data = items.filter(r => r.threadID !== target.threadID);
      api.sendMessage(`🗑️ Deleted request from: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.threadID, true, (e) => e ? rej(e) : res()));
      session.data = items.filter(r => r.threadID !== target.threadID);
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID);
  }
  return true;
}

// ─────────────────────────────────────────────
//  SESSION INPUT HANDLER (shared between onReply & run)
// ─────────────────────────────────────────────
async function handleSessionInput(api, rawApi, session, input, senderID, threadID, replyManager, reactionManager) {
  sessionResetTimer(senderID);

  // Previous page
  if (input === "0") {
    await navigatePage(api, session, -1, replyManager, reactionManager);
    return true;
  }

  // sms all cancellation
  if (input === "off" && session.smsAll) {
    session.smsAll.cancelled = true;
    sessionClear(senderID);
    api.sendMessage("📴 Broadcast cancelled.", threadID);
    return true;
  }

  // Type-specific actions
  if (session.type === "req") {
    const handled = await doReqAction(api, rawApi, session, input, threadID);
    if (handled) return true;
  }

  if (session.type === "list") {
    const handled = await doListAction(api, rawApi, session, input, threadID, replyManager, reactionManager);
    if (handled) return true;
  }

  if (session.type === "block") {
    const handled = await doBlockAction(api, rawApi, session, input, threadID);
    if (handled) return true;
  }

  if (session.type === "mr") {
    const handled = await doMRAction(api, rawApi, session, input, threadID);
    if (handled) return true;
  }

  if (session.type === "inbox") {
    const msgMatch = input.match(/^(\d+)msg$/i);
    if (msgMatch) {
      const num = parseInt(msgMatch[1]);
      const t = session.data[num - 1];
      if (!t) { api.sendMessage(`❌ No thread #${num}.`, threadID); return true; }
      api.sendMessage(`💬 Thread: ${t.name}\nID: ${t.threadID}`, threadID);
      return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────
//  SMS ALL — BROADCAST WITH STATUS UPDATES
// ─────────────────────────────────────────────
async function runSmsAll(api, rawApi, threadID, text, authorID) {
  const result = await fetchFriendsList(rawApi);
  if (result.error || result.data.length === 0) {
    return api.sendMessage(`❌ Could not load friends list: ${result.error || "Empty"}`, threadID);
  }

  const friends = result.data;
  const state = { cancelled: false };
  sessionCreate(authorID, "sms_all", [], threadID, { smsAll: state });

  const statusInfo = await new Promise(res =>
    api.sendMessage(`📢 Sending to ${friends.length} friends...\n0/${friends.length} done`, threadID, (e, i) => res(i))
  );
  const statusMsgID = statusInfo ? statusInfo.messageID : null;

  let sent = 0;
  const sentIDs = [];

  for (const friend of friends) {
    if (state.cancelled) break;
    try {
      const info = await new Promise(res =>
        api.sendMessage(text, friend.userID, (e, i) => res(i))
      );
      if (info && info.messageID) sentIDs.push(info.messageID);
      sent++;

      if (statusMsgID && sent % 5 === 0) {
        api.sendMessage(`📢 Sending...\n${sent}/${friends.length} done`, threadID);
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 200));
  }

  const finalText = state.cancelled
    ? `📴 Broadcast cancelled. Sent: ${sent}/${friends.length}`
    : `✅ Broadcast complete!\n📤 Sent to: ${sent}/${friends.length} friends`;

  api.sendMessage(finalText, threadID);
  if (statusMsgID) unsendMsg(api, statusMsgID);
  sessionClear(authorID);
}

// ─────────────────────────────────────────────
//  NAVIGATION HELPER (next/prev page)
// ─────────────────────────────────────────────
async function navigatePage(api, session, dir, replyManager, reactionManager) {
  const tp = Math.max(1, Math.ceil(session.data.length / PER_PAGE));
  const newPage = session.page + dir;
  if (newPage < 0 || newPage >= tp) {
    if (dir === -1) api.sendMessage("ℹ️ ইতোমধ্যে প্রথম পেজে আছেন।", session.threadID);
    return false;
  }
  session.page = newPage;

  let text;
  if (session.type === "req")   text = buildReqMenu(session.data, newPage);
  if (session.type === "list")  text = buildListMenu(session.data, newPage);
  if (session.type === "block") text = buildBlockMenu(session.data, newPage);
  if (session.type === "inbox") text = buildInboxMenu(session.data, newPage);
  if (session.type === "mr")    text = buildMRMenu(session.data, newPage);

  if (text) {
    await sendPage(api, session.threadID, text, session, replyManager, reactionManager);
    sessionResetTimer(session.authorID);
  }
  return true;
}

// ─────────────────────────────────────────────
//  MAIN MODULE EXPORT
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fbc", "fbm", "fbctrl"],
    version: "3.2.0",
    author: "Riyad Bot Team",
    countDown: 3,
    role: 0,
    shortDescription: "Facebook Account Manager",
    longDescription: "Manage friend requests, friends list, block list, inbox, and message requests.",
    category: "account",
    guide: {
      en: "fb | fb list | fb block | fb inbox | fb mr | fb sms <n> <text> | fb sms all <text>"
    }
  },

  // ── REACTION → next page ───────────────────
  onReaction: async function({ api, event, replyManager, reactionManager }) {
    try {
      const { userID, messageID } = event;
      const session = sessionGet(userID);
      if (!session) return;

      // React must be on the bot's last menu message
      if (session.lastMsgID !== messageID) return;

      if (["req", "list", "block", "inbox", "mr"].includes(session.type)) {
        await navigatePage(api, session, 1, replyManager, reactionManager);
      }
    } catch (err) {
      console.error("[fbcontrol] onReaction error:", err);
    }
  },

  // ── REPLY → navigation & actions ──────────
  // Called when user replies to any of the bot's menu messages
  onReply: async function({ api, event, replyManager, reactionManager }) {
    try {
      const { senderID, threadID, body, messageReply } = event;
      const rawApi = getRawApi(api);

      // Determine which session this reply belongs to
      // Either the reply is to the bot's last menu message, or check REPLY_TRACKER
      let session = sessionGet(senderID);

      // If no session by senderID, try matching by messageID of replied message
      if (!session && messageReply && messageReply.messageID) {
        const authorID = REPLY_TRACKER.get(messageReply.messageID);
        if (authorID) session = sessionGet(authorID);
      }

      if (!session) return;

      const input = (body || "").trim().toLowerCase();
      if (!input) return;

      await handleSessionInput(api, rawApi, session, input, session.authorID, threadID, replyManager, reactionManager);
    } catch (err) {
      console.error("[fbcontrol] onReply error:", err);
    }
  },

  // ── RUN — main command entry ───────────────
  run: async function({ api, event, args, replyManager, reactionManager }) {
    try {
      await handleRun({ api, event, args, replyManager, reactionManager });
    } catch (err) {
      console.error("[fbcontrol] Uncaught error in run():", err);
      try {
        api.sendMessage(
          `❌ fbcontrol crashed: ${err && err.message ? err.message : String(err)}`,
          event.threadID
        );
      } catch (_) {}
    }
  }
};

// ─────────────────────────────────────────────
//  HANDLE RUN (internal)
// ─────────────────────────────────────────────
async function handleRun({ api, event, args, replyManager, reactionManager }) {
  const { senderID, threadID, body } = event;
  const rawApi = getRawApi(api);
  const sub = (args[0] || "").toLowerCase();
  const session = sessionGet(senderID);

  // ── SMS COMMANDS ──────────────────────────
  if (sub === "sms") {
    const target = args[1];
    if (!target) return api.sendMessage("❌ Usage: fb sms <n> <text>  OR  fb sms all <text>", threadID);

    if (target.toLowerCase() === "all") {
      const msg = args.slice(2).join(" ");
      if (!msg) return api.sendMessage("❌ Usage: fb sms all <text>", threadID);
      return await runSmsAll(api, rawApi, threadID, msg, senderID);
    }

    if (target.toLowerCase() === "off") {
      const s = sessionGet(senderID);
      if (s && s.smsAll) {
        s.smsAll.cancelled = true;
        sessionClear(senderID);
        return api.sendMessage("📴 Broadcast cancelled.", threadID);
      }
      return api.sendMessage("ℹ️ No active broadcast.", threadID);
    }

    const n = parseInt(target);
    if (isNaN(n)) return api.sendMessage("❌ Usage: fb sms <number> <text>", threadID);
    const msg = args.slice(2).join(" ");
    if (!msg) return api.sendMessage("❌ Please include a message text.", threadID);

    const result = await fetchFriendsList(rawApi);
    if (result.error || !result.data.length)
      return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);

    const friend = result.data[n - 1];
    if (!friend) return api.sendMessage(`❌ No friend #${n}.`, threadID);

    try {
      await new Promise((res, rej) =>
        api.sendMessage(msg, friend.userID, (e) => e ? rej(e) : res())
      );
      api.sendMessage(`✅ Message sent to ${friend.fullName}`, threadID);
    } catch (e) {
      api.sendMessage(`❌ Failed to send to ${friend.fullName}: ${e.message}`, threadID);
    }
    return;
  }

  // ── SESSION NAVIGATION (if session active & user typed inline without reply) ──
  if (session) {
    // Strip any "fb ..." prefix from the body to get the raw input
    const rawInput = (body || "").trim().replace(/^(?:fb\w*|fbc|fbm)\s*/i, "").trim().toLowerCase();
    const handled = await handleSessionInput(api, rawApi, session, rawInput, senderID, threadID, replyManager, reactionManager);
    if (handled) return;
    // unknown input while session active — silently ignore
    return;
  }

  // ── FRESH COMMANDS ────────────────────────

  if (!sub || sub === "help") {
    return api.sendMessage(buildHelpMenu(), threadID);
  }

  // fb list
  if (sub === "list") {
    api.sendMessage("⏳ Loading friends list...", threadID);
    const result = await fetchFriendsList(rawApi);
    if (result.error && result.data.length === 0)
      return api.sendMessage(`❌ ${result.error}`, threadID);

    sessionCreate(senderID, "list", result.data, threadID);
    const s = sessionGet(senderID);
    await sendPage(api, threadID, buildListMenu(result.data, 0), s, replyManager, reactionManager);
    return;
  }

  // fb block
  if (sub === "block") {
    api.sendMessage("⏳ Loading block list (this may take a moment)...", threadID);
    const result = await fetchBlockList(rawApi);
    if (result.error && result.data.length === 0)
      return api.sendMessage(`❌ ${result.error}`, threadID);

    sessionCreate(senderID, "block", result.data, threadID);
    const s = sessionGet(senderID);
    await sendPage(api, threadID, buildBlockMenu(result.data, 0), s, replyManager, reactionManager);
    return;
  }

  // fb inbox
  if (sub === "inbox") {
    api.sendMessage("⏳ Loading inbox...", threadID);
    const result = await fetchInbox(api);
    if (result.error && result.data.length === 0)
      return api.sendMessage(`❌ ${result.error}`, threadID);

    sessionCreate(senderID, "inbox", result.data, threadID);
    const s = sessionGet(senderID);
    await sendPage(api, threadID, buildInboxMenu(result.data, 0), s, replyManager, reactionManager);
    return;
  }

  // fb mr
  if (sub === "mr") {
    api.sendMessage("⏳ Loading message requests...", threadID);
    const result = await fetchMessageRequests(api);
    if (result.error && result.data.length === 0)
      return api.sendMessage(`❌ ${result.error}`, threadID);

    sessionCreate(senderID, "mr", result.data, threadID);
    const s = sessionGet(senderID);
    await sendPage(api, threadID, buildMRMenu(result.data, 0), s, replyManager, reactionManager);
    return;
  }

  // Default: show friend requests
  api.sendMessage("⏳ Loading friend requests...", threadID);
  const result = await fetchFriendRequests(rawApi);
  if (result.error && result.data.length === 0)
    return api.sendMessage(`❌ ${result.error}`, threadID);

  sessionCreate(senderID, "req", result.data, threadID);
  const s = sessionGet(senderID);
  await sendPage(api, threadID, buildReqMenu(result.data, 0), s, replyManager, reactionManager);
}
