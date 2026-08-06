/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  Aliases: fb, fbc, fbm            ║
 * ║  Version: 4.0.1  (fixed for botEngine's replyManager/     ║
 * ║  reactionManager interface — onStart/onReply/onReaction)  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * ── TECHNICAL NOTES ─────────────────────────────────────────
 * Riyad Framework V2 passes args INCLUDING the command trigger:
 *   "fb mr"       → args = ["fb", "mr"]
 *   "fbcontrol list" → args = ["fbcontrol", "list"]
 *   So: commandUsed = args[0], sub = args[1]
 *
 * Pagination reply/reaction routing goes through the bot's own
 * replyManager / reactionManager modules (register + onReply /
 * onReaction), NOT a global.client.handleReply/handleReaction
 * array — that pattern belongs to a different framework and is
 * not supported by this bot's botEngine.js.
 *
 * The raw fca-riyad api is at api.api (MessengerAdapter wraps it)
 * ────────────────────────────────────────────────────────────
 */
"use strict";

const replyManager = require("../replies/replyManager");
const reactionManager = require("../reactions/reactionManager");

// ─────────────────────────────────────────────
//  RAW API HELPER
// ─────────────────────────────────────────────
function getRawApi(api) {
  if (api && api.api && typeof api.api === "object") return api.api;
  return api;
}

// ─────────────────────────────────────────────
//  SESSION STORE  (keyed by senderID)
// ─────────────────────────────────────────────
const SESSIONS = new Map();
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const PER_PAGE = 10;

function sessionCreate(authorID, type, data, threadID, extra = {}) {
  clearSessionTimer(authorID);
  const timer = setTimeout(() => SESSIONS.delete(String(authorID)), SESSION_TIMEOUT_MS);
  SESSIONS.set(String(authorID), {
    type, data, page: 0, authorID: String(authorID),
    threadID, lastMsgID: null, timer,
    smsAll: null,
    ...extra
  });
}

function sessionGet(authorID) { return SESSIONS.get(String(authorID)) || null; }

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

// ─────────────────────────────────────────────
//  FRAMEWORK HANDLER REGISTRATION
//  Registers the bot's sent message for reply + reaction routing
//  via this bot's actual replyManager / reactionManager modules.
// ─────────────────────────────────────────────
function registerHandlers(authorID, msgID, sessionType) {
  const uid = String(authorID);
  const data = { commandName: "fbcontrol", authorID: uid, type: sessionType };
  replyManager.register(msgID, data);
  reactionManager.register(msgID, data);
}

// ─────────────────────────────────────────────
//  UNSEND HELPERS
// ─────────────────────────────────────────────
function unsendMsg(api, msgID) {
  if (!msgID) return;
  try {
    if (typeof api.unsendMessage === "function") api.unsendMessage(msgID, () => {});
    else {
      const raw = getRawApi(api);
      if (typeof raw.unsendMessage === "function") raw.unsendMessage(msgID, () => {});
    }
  } catch (_) {}
}

function unsendAfter(api, msgID, ms = 5000) {
  if (!msgID) return;
  setTimeout(() => unsendMsg(api, msgID), ms);
}

// ─────────────────────────────────────────────
//  SEND PAGE  — unsends previous, sends new, registers handlers
// ─────────────────────────────────────────────
async function sendPage(api, threadID, text, session) {
  // Unsend previous page message
  if (session.lastMsgID) {
    unsendMsg(api, session.lastMsgID);
    session.lastMsgID = null;
  }

  return new Promise((resolve) => {
    api.sendMessage(text, threadID, (err, info) => {
      if (!err && info && info.messageID) {
        session.lastMsgID = info.messageID;
        registerHandlers(session.authorID, info.messageID, session.type);
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
║  📘  FB CONTROL v4.0.1    ║
╚══════════════════════════╝
${D}
📋 ALL COMMANDS & FUNCTIONS
${D}

📩 fb
   ├ Friend Request Manager
   ├ <n>a → Accept request #n
   ├ <n>d → Delete / Reject #n
   ├ <n>b → Block requester #n
   └ bulk a / d / b → Bulk action

👥 fb list
   ├ Friends List (A-Z or newest)
   ├ <n>msg → Message friend #n
   ├ <n>uf  → Unfriend #n
   ├ <n>bl  → Block #n
   ├ bulk uf / bl → Bulk action
   ├ s <name> → Search by name
   └ sort az / sort new → Sort

🚫 fb block
   ├ Block List Manager
   ├ <n>u   → Unblock user #n
   ├ <n>msg → View user #n info
   └ bulk u → Bulk unblock

📨 fb inbox
   ├ Recent DM Conversations
   └ <n>msg → Open chat #n

📬 fb mr
   ├ Message Requests (all folders)
   ├ Shows: 🆕NEW & [GROUP] badges
   ├ Shows: 🤝YOU MAY KNOW & ⚠️SPAM
   ├ <n>a → Accept request #n
   ├ <n>d → Delete request #n
   ├ <n>b → Block sender #n
   └ bulk a / d / b → Bulk action

📤 fb sms <n> <text>
   └ Send DM to friend number #n

📢 fb sms all <text>
   ├ Broadcast DM to ALL friends
   ├ Progress updates every 5 sends
   ├ Messages auto-delete after 5s
   └ Reply "off" → Cancel broadcast

📋 fbcontrol list
   └ Show this command guide

${D}
🕹️  NAVIGATION (all menus)
${D}
  ❤️ React  → Next page
  Reply 0   → Previous page
  <n>a/d/b  → Action on item #n
${D}
⚠️  Role: Admin / Owner only`;
}

function buildReqMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;
  const isLast = page + 1 >= tp;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║   📩 FRIEND REQUESTS      ║\n`;
  msg += `╠══════════════════════════╣\n`;
  msg += `║  Page ${String(page + 1).padEnd(2)}/${String(tp).padEnd(2)}  │  Total: ${String(requests.length).padEnd(4)}║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No pending friend requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      msg += `\n${start + i + 1}. 👤 ${r.name}\n`;
      msg += `   🆔 ${r.uid}\n`;
      msg += `   🔗 fb.com/${r.uid}\n`;
      msg += `   ✅a Accept │ ❌d Delete │ 🚫b Block\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `📌 bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;
  if (isLast) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই`;
  } else {
    msg += `  ❤️ React → Next    0 → Prev`;
  }
  return msg;
}

function buildListMenu(friends, page) {
  const tp = Math.max(1, Math.ceil(friends.length / PER_PAGE));
  const items = friends.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;
  const isLast = page + 1 >= tp;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║   👥 FRIENDS LIST         ║\n`;
  msg += `╠══════════════════════════╣\n`;
  msg += `║  Page ${String(page + 1).padEnd(2)}/${String(tp).padEnd(2)}  │  Total: ${String(friends.length).padEnd(4)}║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No friends found.\n\n`;
  } else {
    items.forEach((f, i) => {
      msg += `\n${start + i + 1}. 👤 ${f.fullName}\n`;
      msg += `   🆔 ${f.userID}\n`;
      msg += `   💬msg  🚫bl  ❌uf\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `📌 s <name> Search │ sort az │ sort new\n`;
  msg += `${D}\n`;
  if (isLast) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই`;
  } else {
    msg += `  ❤️ React → Next    0 → Prev`;
  }
  return msg;
}

function buildBlockMenu(blocked, page) {
  const tp = Math.max(1, Math.ceil(blocked.length / PER_PAGE));
  const items = blocked.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;
  const isLast = page + 1 >= tp;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║   🚫 BLOCK LIST           ║\n`;
  msg += `╠══════════════════════════╣\n`;
  msg += `║  Page ${String(page + 1).padEnd(2)}/${String(tp).padEnd(2)}  │  Total: ${String(blocked.length).padEnd(4)}║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 Block list is empty.\n\n`;
  } else {
    items.forEach((u, i) => {
      msg += `\n${start + i + 1}. 👤 ${u.name}\n`;
      msg += `   🆔 ${u.uid}\n`;
      msg += `   ✅u Unblock │ 💬msg Info\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `📌 bulk u → Bulk unblock\n`;
  msg += `${D}\n`;
  if (isLast) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই`;
  } else {
    msg += `  ❤️ React → Next    0 → Prev`;
  }
  return msg;
}

function buildInboxMenu(threads, page) {
  const tp = Math.max(1, Math.ceil(threads.length / PER_PAGE));
  const items = threads.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;
  const isLast = page + 1 >= tp;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║   📨 INBOX                ║\n`;
  msg += `╠══════════════════════════╣\n`;
  msg += `║  Page ${String(page + 1).padEnd(2)}/${String(tp).padEnd(2)}  │  Total: ${String(threads.length).padEnd(4)}║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 Inbox is empty.\n\n`;
  } else {
    items.forEach((t, i) => {
      msg += `\n${start + i + 1}. ${t.isGroup ? "👥" : "👤"} ${t.name}\n`;
      msg += `   🆔 ${t.threadID}\n`;
      if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 30)}..."\n`;
      msg += `   📤 <n>msg → Open\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${D}\n`;
  if (isLast) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই`;
  } else {
    msg += `  ❤️ React → Next    0 → Prev`;
  }
  return msg;
}

function buildMRMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;
  const isLast = page + 1 >= tp;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║   📬 MESSAGE REQUESTS     ║\n`;
  msg += `╠══════════════════════════╣\n`;
  msg += `║  Page ${String(page + 1).padEnd(2)}/${String(tp).padEnd(2)}  │  Total: ${String(requests.length).padEnd(4)}║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No message requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      const newBadge  = r.isNew    ? " 🆕NEW"    : "";
      const grpBadge  = r.isGroup  ? " [GROUP]"   : "";
      const secBadge  = r.section === "spam" ? " ⚠️SPAM" : " 🤝YOUMAYKNOW";
      msg += `\n${start + i + 1}. ${r.isGroup ? "👥" : "👤"} ${r.name}${newBadge}${grpBadge}${secBadge}\n`;
      msg += `   🆔 ${r.threadID}\n`;
      if (r.snippet) msg += `   💬 "${r.snippet.substring(0, 28)}..."\n`;
      msg += `   ✅a Accept │ ❌d Delete │ 🚫b Block\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `📌 bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;
  if (isLast) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই`;
  } else {
    msg += `  ❤️ React → Next    0 → Prev`;
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
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "Cookie": cookieStr || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.6099.230 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": "https://www.facebook.com/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "upgrade-insecure-requests": "1"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `https://www.facebook.com${res.headers.location}`;
        return httpsGet(next, cookieStr, depth + 1).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
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
  if (!cookieStr) return { data: [], error: "Could not read session cookies." };

  try {
    const res = await httpsGet("https://mbasic.facebook.com/friends/requests/", cookieStr);
    const html = res.body || "";
    const results = [];

    const re = /href="\/(?:profile\.php\?id=)?([^"?&\n]{1,60})[^"]*"[^>]*>([^<]{2,60})<\/a>[\s\S]{0,800}?(?:Confirm|Xác nhận|تأكيد)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const uid = m[1].replace("profile.php?id=", "").split("?")[0].trim();
      const name = m[2].replace(/&amp;/g, "&").trim();
      if (!uid || uid.includes("/") || uid.includes("=") || name.length < 2) continue;
      if (results.find(r => r.uid === uid)) continue;
      results.push({ uid, name, profileUrl: `https://www.facebook.com/${uid}` });
    }

    if (results.length === 0) {
      const jre = /"userID":"(\d+)"[^}]{0,200}"name":"([^"]+)"/g;
      while ((m = jre.exec(html)) !== null) {
        if (results.find(r => r.uid === m[1])) continue;
        results.push({ uid: m[1], name: m[2], profileUrl: `https://www.facebook.com/${m[1]}` });
      }
    }

    return {
      data: results,
      error: results.length === 0 ? "No pending friend requests found (or page parse failed)." : null
    };
  } catch (e) {
    return { data: [], error: e.message };
  }
}

async function fetchFriendsList(rawApi) {
  return new Promise((resolve) => {
    if (typeof rawApi.getFriendsList !== "function")
      return resolve({ data: [], error: "getFriendsList not available on raw api." });
    rawApi.getFriendsList((err, data) => {
      if (err) return resolve({ data: [], error: err.message || String(err) });
      const friends = Object.values(data || {}).map(f => ({
        userID: f.userID,
        fullName: f.fullName || f.name || "Unknown",
        profileUrl: f.profileUrl || `https://www.facebook.com/${f.userID}`
      }));
      resolve({ data: friends, error: null });
    });
  });
}

async function fetchBlockList(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Could not read session cookies." };

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

      const re = /href="\/(?:profile\.php\?id=)?([^"?&\n]{1,60})[^"]*"[^>]*>([^<]{2,60})<\/a>[\s\S]{0,600}?Unblock/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const uid = m[1].replace("profile.php?id=", "").split("?")[0].trim();
        const name = m[2].replace(/&amp;/g, "&").trim();
        if (!uid || uid.includes("/") || uid.length < 3 || name.length < 2) continue;
        if (results.find(r => r.uid === uid)) continue;
        results.push({ uid, name });
      }

      if (results.length === 0) {
        const jre = /"uid":"?(\d+)"?[^}]{0,200}?"name":"([^"]+)"/g;
        while ((m = jre.exec(html)) !== null) {
          if (results.find(r => r.uid === m[1])) continue;
          results.push({ uid: m[1], name: m[2].trim() });
        }
      }

      if (results.length > 0) return { data: results, error: null };
    } catch (_) {}
  }

  return {
    data: [],
    error: "Block list could not be loaded.\n" +
      "📌 Facebook's HTML may have changed, or the bot's cookies may need refreshing.\n" +
      "This feature uses cookie-based page scraping."
  };
}

async function fetchInbox(api) {
  return new Promise((resolve) => {
    if (typeof api.getThreadList !== "function")
      return resolve({ data: [], error: "getThreadList not available." });
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
    if (typeof api.getThreadList !== "function")
      return resolve({ data: [], error: "getThreadList not available." });

    api.getThreadList(30, null, ["OTHER"], (err, threads) => {
      const known = err ? [] : buildMRList(threads || [], "you_may_know");

      api.getThreadList(20, null, ["SPAM"], (err2, spam) => {
        const spamList = err2 ? [] : buildMRList(spam || [], "spam");
        resolve({ data: [...known, ...spamList], error: null });
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
    isNew: !t.isSubscribed || false,
    section
  }));
}

// ─────────────────────────────────────────────
//  ACTION HANDLERS
// ─────────────────────────────────────────────
async function doReqAction(api, rawApi, session, input, threadID) {
  const singleMatch = input.match(/^(\d+)(a|d|b)$/i);
  const bulkMatch   = input.match(/^bulk\s+(a|d|b)$/i);
  if (!singleMatch && !bulkMatch) return false;

  const items = session.data;

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const r of pageItems) {
      try {
        if (action === "a")      await callFriendAction(rawApi, r.uid, "confirm");
        else if (action === "d") await callFriendAction(rawApi, r.uid, "delete");
        else if (action === "b") await prom(cb => rawApi.changeBlockedStatus(r.uid, true, cb));
        done++;
      } catch (_) {}
    }
    const label = action === "a" ? "Accepted" : action === "d" ? "Deleted" : "Blocked";
    session.data = items.filter(r => !pageItems.find(p => p.uid === r.uid));
    api.sendMessage(`✅ Bulk ${label}: ${done} requests done.`, threadID);
    return true;
  }

  const num = parseInt(singleMatch[1]);
  const action = singleMatch[2].toLowerCase();
  const target = items[num - 1];
  if (!target) { api.sendMessage(`❌ No request #${num}.`, threadID); return true; }

  try {
    if (action === "a") {
      await callFriendAction(rawApi, target.uid, "confirm");
      api.sendMessage(`✅ Accepted: ${target.name}`, threadID);
    } else if (action === "d") {
      await callFriendAction(rawApi, target.uid, "delete");
      api.sendMessage(`🗑️ Deleted: ${target.name}`, threadID);
    } else if (action === "b") {
      await prom(cb => rawApi.changeBlockedStatus(target.uid, true, cb));
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
    session.data = items.filter(r => r.uid !== target.uid);
  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message}`, threadID);
  }
  return true;
}

function callFriendAction(rawApi, uid, type) {
  return new Promise((resolve, reject) => {
    if (typeof rawApi.handleFriendRequest !== "function")
      return reject(new Error("handleFriendRequest not available"));
    rawApi.handleFriendRequest(uid, type, (err) => err ? reject(err) : resolve());
  });
}

async function doListAction(api, rawApi, session, input, threadID) {
  const msgMatch  = input.match(/^(\d+)msg$/i);
  const ufMatch   = input.match(/^(\d+)uf$/i);
  const blMatch   = input.match(/^(\d+)bl$/i);
  const bulkMatch = input.match(/^bulk\s+(uf|bl)$/i);
  const srchMatch = input.match(/^s\s+(.+)$/i);
  const sortMatch = input.match(/^sort\s+(az|new)$/i);

  if (!msgMatch && !ufMatch && !blMatch && !bulkMatch && !srchMatch && !sortMatch) return false;

  const items = session.data;

  if (srchMatch) {
    const q = srchMatch[1].toLowerCase();
    const found = items.filter(f => f.fullName.toLowerCase().includes(q));
    api.sendMessage(
      `🔍 "${srchMatch[1]}" → ${found.length} results:\n\n` +
      found.slice(0, 15).map((f, i) => `${i + 1}. ${f.fullName}`).join("\n"),
      threadID
    );
    return true;
  }

  if (sortMatch) {
    if (sortMatch[1] === "az")
      session.data = [...items].sort((a, b) => a.fullName.localeCompare(b.fullName));
    else
      session.data = [...items].reverse();
    session.page = 0;
    await sendPage(api, threadID, buildListMenu(session.data, 0), session);
    return true;
  }

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const f of pageItems) {
      try {
        if (action === "uf")     await prom(cb => rawApi.unfriend(f.userID, cb));
        else if (action === "bl") await prom(cb => rawApi.changeBlockedStatus(f.userID, true, cb));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(f => !pageItems.find(p => p.userID === f.userID));
    api.sendMessage(`✅ Bulk ${action === "uf" ? "Unfriended" : "Blocked"}: ${done} done.`, threadID);
    return true;
  }

  if (msgMatch) {
    const t = items[parseInt(msgMatch[1]) - 1];
    if (!t) { api.sendMessage(`❌ No friend #${msgMatch[1]}.`, threadID); return true; }
    api.sendMessage(`💬 ${t.fullName}\n🆔 ${t.userID}`, threadID);
    return true;
  }

  if (ufMatch) {
    const t = items[parseInt(ufMatch[1]) - 1];
    if (!t) { api.sendMessage(`❌ No friend #${ufMatch[1]}.`, threadID); return true; }
    try {
      await prom(cb => rawApi.unfriend(t.userID, cb));
      session.data = items.filter(f => f.userID !== t.userID);
      api.sendMessage(`✅ Unfriended: ${t.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
    return true;
  }

  if (blMatch) {
    const t = items[parseInt(blMatch[1]) - 1];
    if (!t) { api.sendMessage(`❌ No friend #${blMatch[1]}.`, threadID); return true; }
    try {
      await prom(cb => rawApi.changeBlockedStatus(t.userID, true, cb));
      session.data = items.filter(f => f.userID !== t.userID);
      api.sendMessage(`🚫 Blocked: ${t.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
    return true;
  }

  return false;
}

async function doBlockAction(api, rawApi, session, input, threadID) {
  const uMatch    = input.match(/^(\d+)u$/i);
  const msgMatch  = input.match(/^(\d+)msg$/i);
  const bulkMatch = input.match(/^bulk\s+u$/i);

  if (!uMatch && !msgMatch && !bulkMatch) return false;

  const items = session.data;

  if (bulkMatch) {
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const u of pageItems) {
      try { await prom(cb => rawApi.changeBlockedStatus(u.uid, false, cb)); done++; } catch (_) {}
    }
    session.data = items.filter(u => !pageItems.find(p => p.uid === u.uid));
    api.sendMessage(`✅ Bulk Unblocked: ${done} done.`, threadID);
    return true;
  }

  if (uMatch) {
    const t = items[parseInt(uMatch[1]) - 1];
    if (!t) { api.sendMessage(`❌ No user #${uMatch[1]}.`, threadID); return true; }
    try {
      await prom(cb => rawApi.changeBlockedStatus(t.uid, false, cb));
      session.data = items.filter(u => u.uid !== t.uid);
      api.sendMessage(`✅ Unblocked: ${t.name}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
    return true;
  }

  if (msgMatch) {
    const t = items[parseInt(msgMatch[1]) - 1];
    if (!t) { api.sendMessage(`❌ No user #${msgMatch[1]}.`, threadID); return true; }
    api.sendMessage(`👤 ${t.name}\n🆔 ${t.uid}`, threadID);
    return true;
  }

  return false;
}

async function doMRAction(api, rawApi, session, input, threadID) {
  const singleMatch = input.match(/^(\d+)(a|d|b)$/i);
  const bulkMatch   = input.match(/^bulk\s+(a|d|b)$/i);
  if (!singleMatch && !bulkMatch) return false;

  const items = session.data;

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const r of pageItems) {
      try {
        if (action === "d" && typeof rawApi.deleteThread === "function")
          await prom(cb => rawApi.deleteThread(r.threadID, cb));
        else if (action === "b")
          await prom(cb => rawApi.changeBlockedStatus(r.threadID, true, cb));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(r => !pageItems.find(p => p.threadID === r.threadID));
    const label = action === "a" ? "Accepted" : action === "d" ? "Deleted" : "Blocked";
    api.sendMessage(`✅ Bulk ${label}: ${done} done.`, threadID);
    return true;
  }

  const num = parseInt(singleMatch[1]);
  const action = singleMatch[2].toLowerCase();
  const target = items[num - 1];
  if (!target) { api.sendMessage(`❌ No request #${num}.`, threadID); return true; }

  try {
    if (action === "a") {
      api.sendMessage(`✅ Accepted: ${target.name}\n💬 You can now message them.`, threadID);
    } else if (action === "d") {
      if (typeof rawApi.deleteThread === "function")
        await prom(cb => rawApi.deleteThread(target.threadID, cb));
      api.sendMessage(`🗑️ Deleted request: ${target.name}`, threadID);
    } else if (action === "b") {
      await prom(cb => rawApi.changeBlockedStatus(target.threadID, true, cb));
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
    session.data = items.filter(r => r.threadID !== target.threadID);
  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message}`, threadID);
  }
  return true;
}

async function doInboxAction(api, session, input, threadID) {
  const msgMatch = input.match(/^(\d+)msg$/i);
  if (!msgMatch) return false;
  const t = session.data[parseInt(msgMatch[1]) - 1];
  if (!t) { api.sendMessage(`❌ No thread #${msgMatch[1]}.`, threadID); return true; }
  api.sendMessage(`💬 ${t.name}\n🆔 ${t.threadID}`, threadID);
  return true;
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
async function navigatePage(api, authorID, dir) {
  const session = sessionGet(authorID);
  if (!session) return false;

  const tp = Math.max(1, Math.ceil(session.data.length / PER_PAGE));
  const newPage = session.page + dir;
  if (newPage < 0 || newPage >= tp) return false;

  session.page = newPage;
  let text;
  switch (session.type) {
    case "req":   text = buildReqMenu(session.data, newPage); break;
    case "list":  text = buildListMenu(session.data, newPage); break;
    case "block": text = buildBlockMenu(session.data, newPage); break;
    case "inbox": text = buildInboxMenu(session.data, newPage); break;
    case "mr":    text = buildMRMenu(session.data, newPage); break;
    default: return false;
  }

  await sendPage(api, session.threadID, text, session);
  sessionResetTimer(authorID);
  return true;
}

// ─────────────────────────────────────────────
//  DISPATCH REPLY INPUT  (shared by onReply + direct session input)
// ─────────────────────────────────────────────
async function dispatchInput(api, rawApi, session, input, threadID) {
  const normalised = input.trim().toLowerCase();

  // Previous page
  if (normalised === "0") {
    await navigatePage(api, session.authorID, -1);
    return;
  }

  // sms all cancel
  if (normalised === "off" && session.smsAll) {
    session.smsAll.cancelled = true;
    sessionClear(session.authorID);
    api.sendMessage("📴 Broadcast cancelled.", threadID);
    return;
  }

  // Type-specific
  let handled = false;
  if (session.type === "req")   handled = await doReqAction(api, rawApi, session, normalised, threadID);
  if (session.type === "list")  handled = await doListAction(api, rawApi, session, normalised, threadID);
  if (session.type === "block") handled = await doBlockAction(api, rawApi, session, normalised, threadID);
  if (session.type === "mr")    handled = await doMRAction(api, rawApi, session, normalised, threadID);
  if (session.type === "inbox") handled = await doInboxAction(api, session, normalised, threadID);

  if (handled) sessionResetTimer(session.authorID);
}

// ─────────────────────────────────────────────
//  SMS ALL BROADCAST
// ─────────────────────────────────────────────
async function runSmsAll(api, rawApi, threadID, text, authorID) {
  if (text.trim().toLowerCase() === "off") {
    const s = sessionGet(authorID);
    if (s && s.smsAll) {
      s.smsAll.cancelled = true;
      sessionClear(authorID);
      return api.sendMessage("📴 Broadcast cancelled.", threadID);
    }
    return api.sendMessage("ℹ️ No active broadcast to cancel.", threadID);
  }

  const result = await fetchFriendsList(rawApi);
  if (!result.data.length)
    return api.sendMessage(`❌ Friends list empty or unavailable: ${result.error || ""}`, threadID);

  const friends = result.data;
  const state = { cancelled: false };
  sessionCreate(authorID, "sms_all", [], threadID, { smsAll: state });

  const statusInfo = await new Promise(res =>
    api.sendMessage(`📢 Starting broadcast to ${friends.length} friends...\n0/${friends.length} done`, threadID, (e, i) => res(i))
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
        api.sendMessage(`📢 Broadcast progress: ${sent}/${friends.length}`, threadID);
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }

  if (statusMsgID) unsendMsg(api, statusMsgID);

  const finalText = state.cancelled
    ? `📴 Broadcast cancelled.\n✅ Sent to: ${sent}/${friends.length} friends`
    : `✅ Broadcast complete!\n📤 Sent to: ${sent}/${friends.length} friends\n\n⏱️ Messages will auto-delete in 5s...`;

  api.sendMessage(finalText, threadID, (e, info) => {
    if (info) unsendAfter(api, info.messageID, 8000);
  });

  // Auto-unsend all sent DMs after 5 seconds
  if (!state.cancelled && sentIDs.length > 0) {
    setTimeout(() => sentIDs.forEach(id => unsendMsg(api, id)), 5000);
  }

  sessionClear(authorID);
}

// ─────────────────────────────────────────────
//  PROMISE WRAPPER
// ─────────────────────────────────────────────
function prom(fn) {
  return new Promise((res, rej) => fn((err, data) => err ? rej(err) : res(data)));
}

// ─────────────────────────────────────────────
//  MODULE EXPORT
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fb", "fbc", "fbm"],
    version: "4.0.1",
    author: "Riyad Bot Team",
    countDown: 3,
    role: 2,                          // Admin/Owner only
    shortDescription: "Facebook Account Manager",
    longDescription: "Manage friend requests, friends list, block list, inbox, and message requests. Admin/Owner only.",
    category: "account",
    guide: { en: "fb | fb list | fb block | fb inbox | fb mr | fbcontrol list | fb sms <n> <text> | fb sms all <text>" }
  },

  // ── REACTION HANDLER ─────────────────────────────
  // Called (via reactionManager) when someone reacts to the bot's
  // paginated message that was registered with commandName "fbcontrol".
  onReaction: async function({ api, event, Reaction }) {
    const { userID } = event;
    // Only the original author can navigate
    if (String(userID) !== String(Reaction.authorID)) return;
    await navigatePage(api, userID, 1);
  },

  // ── REPLY HANDLER ────────────────────────────────
  // Called (via replyManager) when someone replies to the bot's
  // paginated message that was registered with commandName "fbcontrol".
  onReply: async function({ api, event, handleReply }) {
    const { senderID, threadID, body } = event;
    // Only the original author can control the session
    if (String(senderID) !== String(handleReply.authorID)) return;

    const rawApi = getRawApi(api);
    const session = sessionGet(senderID);
    if (!session) return;

    await dispatchInput(api, rawApi, session, body || "", threadID);
  },

  // ── MAIN RUN HANDLER ─────────────────────────────
  onStart: async function({ api, event, args }) {
    try {
      await handleRun({ api, event, args });
    } catch (err) {
      console.error("[fbcontrol] Uncaught error in onStart():", err);
      try {
        api.sendMessage(
          `❌ fbcontrol crashed: ${err && err.message ? err.message : String(err)}`,
          event.threadID
        );
      } catch (_) {}
    }
  }
};

async function handleRun({ api, event, args }) {
    const { senderID, threadID, messageID, body } = event;
    const rawApi = getRawApi(api);

    // ── KEY FIX: Riyad Framework includes command name in args[0] ──
    // "fb mr"          → args = ["fb", "mr"]       → commandUsed="fb",  sub="mr"
    // "fbcontrol list" → args = ["fbcontrol","list"]→ commandUsed="fbcontrol", sub="list"
    // "/fb list"       → args = ["/fb","list"]     → commandUsed="fb",  sub="list"
    const commandUsed = (args[0] || "").toLowerCase().replace(/^\//, "");
    const sub         = (args[1] || "").toLowerCase();
    const subArgs     = args.slice(2);

    // ── fbcontrol list → show help menu ─────────────
    if (commandUsed === "fbcontrol" && sub === "list") {
      return api.sendMessage(buildHelpMenu(), threadID);
    }

    // ── SMS COMMANDS ─────────────────────────────────
    if (sub === "sms") {
      const target = (subArgs[0] || "").toLowerCase();
      if (!target) return api.sendMessage("❌ Usage: fb sms <n> <text>  OR  fb sms all <text>", threadID);

      if (target === "all") {
        const msg = subArgs.slice(1).join(" ");
        if (!msg) return api.sendMessage("❌ Usage: fb sms all <text>", threadID);
        return await runSmsAll(api, rawApi, threadID, msg, senderID);
      }

      if (target === "off") {
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
      const msg = subArgs.slice(1).join(" ");
      if (!msg) return api.sendMessage("❌ Please include a message text.", threadID);

      const result = await fetchFriendsList(rawApi);
      if (!result.data.length)
        return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);

      const friend = result.data[n - 1];
      if (!friend) return api.sendMessage(`❌ No friend #${n}.`, threadID);

      try {
        await prom(cb => api.sendMessage(msg, friend.userID, cb));
        api.sendMessage(`✅ Message sent to ${friend.fullName}`, threadID);
      } catch (e) {
        api.sendMessage(`❌ Failed: ${e.message}`, threadID);
      }
      return;
    }

    // ── fb list → Friends List ────────────────────────
    if (sub === "list") {
      api.sendMessage("⏳ Loading friends list...", threadID);
      const result = await fetchFriendsList(rawApi);
      if (!result.data.length)
        return api.sendMessage(`❌ ${result.error || "Friends list empty."}`, threadID);

      sessionCreate(senderID, "list", result.data, threadID);
      const sess = sessionGet(senderID);
      await sendPage(api, threadID, buildListMenu(result.data, 0), sess);
      return;
    }

    // ── fb block → Block List ─────────────────────────
    if (sub === "block") {
      api.sendMessage("⏳ Loading block list (may take a moment)...", threadID);
      const result = await fetchBlockList(rawApi);
      if (!result.data.length)
        return api.sendMessage(`❌ ${result.error || "Block list empty."}`, threadID);

      sessionCreate(senderID, "block", result.data, threadID);
      const sess = sessionGet(senderID);
      await sendPage(api, threadID, buildBlockMenu(result.data, 0), sess);
      return;
    }

    // ── fb inbox → Inbox ──────────────────────────────
    if (sub === "inbox") {
      api.sendMessage("⏳ Loading inbox...", threadID);
      const result = await fetchInbox(api);
      if (!result.data.length)
        return api.sendMessage(`❌ ${result.error || "Inbox empty."}`, threadID);

      sessionCreate(senderID, "inbox", result.data, threadID);
      const sess = sessionGet(senderID);
      await sendPage(api, threadID, buildInboxMenu(result.data, 0), sess);
      return;
    }

    // ── fb mr → Message Requests ──────────────────────
    if (sub === "mr") {
      api.sendMessage("⏳ Loading message requests...", threadID);
      const result = await fetchMessageRequests(api);
      if (!result.data.length)
        return api.sendMessage(`❌ ${result.error || "No message requests found."}`, threadID);

      sessionCreate(senderID, "mr", result.data, threadID);
      const sess = sessionGet(senderID);
      await sendPage(api, threadID, buildMRMenu(result.data, 0), sess);
      return;
    }

    // ── fb (no subcommand) → Friend Requests ──────────
    api.sendMessage("⏳ Loading friend requests...", threadID);
    const result = await fetchFriendRequests(rawApi);
    if (!result.data.length)
      return api.sendMessage(`❌ ${result.error || "No friend requests."}`, threadID);

    sessionCreate(senderID, "req", result.data, threadID);
    const sess = sessionGet(senderID);
    await sendPage(api, threadID, buildReqMenu(result.data, 0), sess);
    }
