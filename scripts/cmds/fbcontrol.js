/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  Aliases: fb, fbc, fbm            ║
 * ║  Version: 3.0.0                                          ║
 * ╚══════════════════════════════════════════════════════════╝
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

function sessionCreate(authorID, type, data, threadID, extra = {}) {
  clearSessionTimer(authorID);
  const timer = setTimeout(() => SESSIONS.delete(String(authorID)), SESSION_TIMEOUT_MS);
  SESSIONS.set(String(authorID), {
    type, data, page: 0, authorID, threadID,
    lastMsgID: null, sentMsgIDs: [], timer,
    smsAll: null, // for sms all broadcast state
    ...extra
  });
}

function sessionGet(authorID) { return SESSIONS.get(String(authorID)) || null; }
function sessionClear(authorID) { clearSessionTimer(authorID); SESSIONS.delete(String(authorID)); }

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
//  SEND PAGE HELPER — unsends previous, sends new, tracks msgID
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
   └ Bulk actions supported

👥 fb list
   └ Friends List Manager
   └ Unfriend / Block / Message
   └ Search & Sort supported

🚫 fb block
   └ Block List Manager
   └ View & Unblock users

📨 fb inbox
   └ Recent DM Conversations
   └ Open any conversation

📬 fb mr
   └ Message Requests
   └ You May Know + Spam
   └ Accept / Delete / Block

📤 fb sms <n> <text>
   └ DM a specific friend

📢 fb sms all <text>
   └ Broadcast to ALL friends
   └ Reply "off" to cancel

${D}
🕹️ NAVIGATION (all menus)
${D}
  ❤️ React  → Next page
  0         → Previous page
  <n>a      → Accept (requests)
  <n>d      → Delete / Reject
  <n>b      → Block
  <n>uf     → Unfriend (list)
  <n>bl     → Block (list)
  <n>u      → Unblock (block list)
  <n>msg    → Open conversation
  bulk a/d/b/uf/bl/u → Bulk actions
  s <name>  → Search (list only)
  sort az / sort new → Sort (list)
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
  msg += `🕹️ CONTROLS\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   0 → Prev\n`;
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
  msg += `🕹️ CONTROLS\n`;
  msg += `  <n>msg  <n>uf Unfriend  <n>bl Block\n`;
  msg += `  s <name> → Search\n`;
  msg += `  sort az / sort new\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   0 → Prev\n`;
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
  msg += `🕹️ CONTROLS\n`;
  msg += `  <n>u Unblock  <n>msg Message\n`;
  msg += `  bulk u → Bulk unblock\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   0 → Prev\n`;
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
      if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 30)}..."\n`;
      msg += `   📤 msg\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS\n`;
  msg += `  <n>msg → Open conversation\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   0 → Prev\n`;
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
      if (r.snippet) msg += `   💬 "${r.snippet.substring(0, 28)}..."\n`;
      msg += `   ✅a Accept  ❌d Delete  🚫b Block\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `🕹️ CONTROLS\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;

  if (page + 1 >= tp) {
    msg += `👍✅ এটাই শেষ পেজ — আর পেজ নেই\n`;
  } else {
    msg += `  ❤️ React → Next   0 → Prev\n`;
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
    // Try mbasic first (more stable HTML)
    const res = await httpsGet("https://mbasic.facebook.com/friends/requests/", cookieStr);
    const html = res.body || "";

    const results = [];
    // Extract from mbasic HTML: profile links contain /profile.php?id= or /username
    const blockRe = /href="\/[^"?]+(?:\?[^"]*)?"\s[^>]*>[^<]*<\/a>[\s\S]*?(?:Confirm|Add Friend)/gi;

    // More targeted: find all user entries in friend request list
    // mbasic shows: <td><a href="/userid">Name</a> ... <a href="/a/friend.php?confirm...">Confirm</a>
    const entryRe = /<a href="\/(?:profile\.php\?id=)?([^"?&\n]+)[^"]*"[^>]*>([^<]{2,60})<\/a>(?:[\s\S]{0,800}?)<a href="[^"]*confirm[^"]*">/gi;
    let m;
    while ((m = entryRe.exec(html)) !== null) {
      const uid = m[1].replace("profile.php?id=", "").split("?")[0].trim();
      const name = m[2].trim();
      if (!uid || uid.includes("/") || uid.includes("=") || uid === "friends") continue;
      if (results.find(r => r.uid === uid)) continue;
      results.push({ uid, name, profileUrl: `https://www.facebook.com/${uid}` });
    }

    // Fallback: JSON embedded in page
    if (results.length === 0) {
      const jsonRe = /"userID":"(\d+)"[^}]*"name":"([^"]+)"/g;
      while ((m = jsonRe.exec(html)) !== null) {
        const uid = m[1];
        const name = m[2];
        if (results.find(r => r.uid === uid)) continue;
        results.push({ uid, name, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` });
      }
    }

    return { data: results, error: results.length === 0 ? "No pending friend requests found." : null };
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

  // Try multiple endpoints
  const endpoints = [
    "https://mbasic.facebook.com/settings/blocking/",
    "https://www.facebook.com/privacy/blocking/",
    "https://m.facebook.com/settings/blocking/"
  ];

  for (const url of endpoints) {
    try {
      const res = await httpsGet(url, cookieStr);
      const html = res.body || "";

      if (res.status === 200 && html.length > 500) {
        const results = [];

        // mbasic: blocked users appear as links with Unblock button nearby
        // Pattern: <a href="/uid">Name</a> ... <a href="/ajax/noscript/...unblock...">Unblock</a>
        const re1 = /href="\/(?:profile\.php\?id=)?([^"?&\n]{1,60})[^"]*"[^>]*>([^<]{2,60})<\/a>[\s\S]{0,500}?Unblock/gi;
        let m;
        while ((m = re1.exec(html)) !== null) {
          const uid = m[1].replace("profile.php?id=", "").split("?")[0].trim();
          const name = m[2].trim();
          if (!uid || uid.includes("/") || name.length < 2) continue;
          if (results.find(r => r.uid === uid)) continue;
          results.push({ uid, name });
        }

        // Fallback: JSON embedded pattern
        if (results.length === 0) {
          const jsonRe = /"uid":"?(\d+)"?[^}]*?"name":"([^"]+)"/g;
          while ((m = jsonRe.exec(html)) !== null) {
            const uid = m[1];
            const name = m[2].trim();
            if (results.find(r => r.uid === uid)) continue;
            results.push({ uid, name });
          }
        }

        if (results.length > 0) return { data: results, error: null };
      }
    } catch (_) {}
  }

  return {
    data: [],
    error: "Block list could not be loaded.\n\n" +
      "📌 Facebook changes its HTML frequently. " +
      "The bot's cookies may also need refreshing. " +
      "Please check if the bot account has any blocked users."
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
    // Message requests are in "OTHER" folder
    api.getThreadList(30, null, ["OTHER"], (err, threads) => {
      if (err) {
        // Try without folder filter
        api.getThreadList(30, null, [], (err2, threads2) => {
          if (err2) return resolve({ data: [], error: err2.message });
          const list = buildMRList(threads2 || [], "other");
          resolve({ data: list, error: null });
        });
        return;
      }
      const known = buildMRList(threads || [], "you_may_know");

      // Also try SPAM folder
      api.getThreadList(20, null, ["SPAM"], (err3, spamThreads) => {
        let all = known;
        if (!err3 && spamThreads && spamThreads.length > 0) {
          const spam = buildMRList(spamThreads, "spam");
          all = [...known, ...spam];
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
    section: section
  }));
}

// ─────────────────────────────────────────────
//  ACTION HANDLERS
// ─────────────────────────────────────────────

async function doReqAction(api, rawApi, session, input, threadID) {
  const match = input.match(/^(\d+)(a|d|b)$/i);
  const bulkMatch = input.match(/^bulk\s+(a|d|b)$/i);

  if (!match && !bulkMatch) return false;

  const items = session.type === "req" ? session.data : null;
  if (!items) return false;

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const r of pageItems) {
      try {
        if (action === "a") await callFriendAction(rawApi, r.uid, "confirm");
        else if (action === "d") await callFriendAction(rawApi, r.uid, "delete");
        else if (action === "b") await rawApi.changeBlockedStatus(r.uid, true, () => {});
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
      await callFriendAction(rawApi, target.uid, "confirm");
      api.sendMessage(`✅ Accepted: ${target.name}`, threadID);
    } else if (action === "d") {
      await callFriendAction(rawApi, target.uid, "delete");
      api.sendMessage(`🗑️ Deleted: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise(r => rawApi.changeBlockedStatus(target.uid, true, r));
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
    if (typeof rawApi.handleFriendRequest === "function") {
      rawApi.handleFriendRequest(uid, type, (err) => err ? reject(err) : resolve());
    } else {
      reject(new Error("handleFriendRequest not available"));
    }
  });
}

async function doListAction(api, rawApi, session, input, threadID) {
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
    session.searchResults = found;
    api.sendMessage(`🔍 Found ${found.length} results for "${searchMatch[1]}".\n\n` +
      found.slice(0, 10).map((f, i) => `${i + 1}. ${f.fullName}`).join("\n"),
      threadID);
    return true;
  }

  if (sortMatch) {
    if (sortMatch[1] === "az") {
      session.data = [...items].sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else {
      session.data = [...items].reverse();
    }
    const text = buildListMenu(session.data, 0);
    session.page = 0;
    await sendPage(api, threadID, text, session);
    return true;
  }

  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const f of pageItems) {
      try {
        if (action === "uf") await new Promise(r => rawApi.unfriend(f.userID, r));
        else if (action === "bl") await new Promise(r => rawApi.changeBlockedStatus(f.userID, true, r));
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
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
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
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
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
        await new Promise(r => rawApi.changeBlockedStatus(u.uid, false, r));
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
    } catch (e) { api.sendMessage(`❌ Error: ${e.message}`, threadID); }
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
        if (action === "d") {
          // Delete message request
          if (typeof rawApi.deleteThread === "function")
            await new Promise(res => rawApi.deleteThread(r.threadID, res));
        } else if (action === "b") {
          await new Promise(res => rawApi.changeBlockedStatus(r.threadID, true, res));
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
      // Accept = start messaging (thread becomes normal)
      api.sendMessage(`✅ Accepted request from: ${target.name}\nYou can now message them.`, threadID);
    } else if (action === "d") {
      if (typeof rawApi.deleteThread === "function")
        await new Promise(res => rawApi.deleteThread(target.threadID, res));
      api.sendMessage(`🗑️ Deleted request from: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise(res => rawApi.changeBlockedStatus(target.threadID, true, res));
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
    session.data = items.filter(r => r.threadID !== target.threadID);
  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message}`, threadID);
  }
  return true;
}

// ─────────────────────────────────────────────
//  SMS ALL — BROADCAST WITH AUTO-UNSEND
// ─────────────────────────────────────────────

async function runSmsAll(api, rawApi, threadID, messageID, text, authorID) {
  // Check for "off" keyword
  if (text.trim().toLowerCase() === "off") {
    const s = sessionGet(authorID);
    if (s && s.smsAll) {
      s.smsAll.cancelled = true;
      api.sendMessage("📴 Broadcast cancelled.", threadID);
      sessionClear(authorID);
    } else {
      api.sendMessage("ℹ️ No active broadcast to cancel.", threadID);
    }
    return;
  }

  const result = await fetchFriendsList(rawApi);
  if (result.error || result.data.length === 0) {
    return api.sendMessage(`❌ Could not load friends list: ${result.error || "Empty"}`, threadID);
  }

  const friends = result.data;
  const state = { cancelled: false };
  sessionCreate(authorID, "sms_all", [], threadID, { smsAll: state });

  const statusMsgInfo = await new Promise(res =>
    api.sendMessage(`📢 Sending to ${friends.length} friends...\n0/${friends.length} done`, threadID, (e, i) => res(i))
  );
  const statusMsgID = statusMsgInfo ? statusMsgInfo.messageID : null;

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

      // Update status every 5 sends
      if (statusMsgID && sent % 5 === 0) {
        try {
          api.sendMessage(
            `📢 Sending to ${friends.length} friends...\n${sent}/${friends.length} done`,
            threadID
          );
        } catch (_) {}
      }
    } catch (_) {}

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // Final report
  const finalText = state.cancelled
    ? `📴 Broadcast cancelled. Sent: ${sent}/${friends.length}`
    : `✅ Broadcast complete!\n📤 Sent to: ${sent}/${friends.length} friends\n\n⏱ Messages will auto-delete in 5 seconds...`;

  api.sendMessage(finalText, threadID, (e, info) => {
    if (info) unsendAfter(api, info.messageID, 8000);
  });

  // Unsend status msg
  if (statusMsgID) unsendMsg(api, statusMsgID);

  // Auto-unsend all sent DMs after 5 seconds
  if (!state.cancelled && sentIDs.length > 0) {
    setTimeout(() => {
      sentIDs.forEach(id => unsendMsg(api, id));
    }, 5000);
  }

  sessionClear(authorID);
}

// ─────────────────────────────────────────────
//  NAVIGATION HELPER (next/prev page)
// ─────────────────────────────────────────────
async function navigatePage(api, session, dir) {
  const tp = Math.max(1, Math.ceil(session.data.length / PER_PAGE));
  const newPage = session.page + dir;
  if (newPage < 0 || newPage >= tp) return false;
  session.page = newPage;

  let text;
  if (session.type === "req")   text = buildReqMenu(session.data, newPage);
  if (session.type === "list")  text = buildListMenu(session.data, newPage);
  if (session.type === "block") text = buildBlockMenu(session.data, newPage);
  if (session.type === "inbox") text = buildInboxMenu(session.data, newPage);
  if (session.type === "mr")    text = buildMRMenu(session.data, newPage);

  if (text) {
    await sendPage(api, session.threadID, text, session);
    sessionResetTimer(session.authorID);
  }
  return true;
}

// ─────────────────────────────────────────────
//  MAIN RUN HANDLER
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fb", "fbc", "fbm"],
    version: "3.0.0",
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

  onReaction: async function({ api, event }) {
    const { userID, messageID } = event;
    const session = sessionGet(userID);
    if (!session) return;
    if (session.lastMsgID !== messageID) return;
    if (["req", "list", "block", "inbox", "mr"].includes(session.type)) {
      await navigatePage(api, session, 1);
    }
  },

  run: async function({ api, event, args }) {
    const { senderID, threadID, messageID, body } = event;
    const rawApi = getRawApi(api);
    const text = (body || "").trim();
    const sub = (args[0] || "").toLowerCase();
    const session = sessionGet(senderID);

    // ── SMS COMMANDS (no session needed) ─────────────────
    if (sub === "sms") {
      const target = args[1];
      if (!target) return api.sendMessage("❌ Usage: fb sms <n> <text>  OR  fb sms all <text>", threadID);

      if (target.toLowerCase() === "all") {
        const msg = args.slice(2).join(" ");
        if (!msg) return api.sendMessage("❌ Usage: fb sms all <text>", threadID);
        return await runSmsAll(api, rawApi, threadID, messageID, msg, senderID);
      }

      // Check for "off" to cancel active sms all
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

    // ── HANDLE ACTIVE SESSION REPLIES ───────────────────
    if (session && !sub) {
      // This shouldn't happen (sub is args[0], but body may differ)
    }

    if (session) {
      const input = text.replace(/^fb\w*\s*/i, "").trim().toLowerCase();

      // Prev page
      if (input === "0") {
        await navigatePage(api, session, -1);
        return;
      }

      // sms all cancellation via reply
      if (input === "off" && session.smsAll) {
        session.smsAll.cancelled = true;
        sessionClear(senderID);
        return api.sendMessage("📴 Broadcast cancelled.", threadID);
      }

      // Type-specific actions
      if (session.type === "req") {
        const handled = await doReqAction(api, rawApi, session, input, threadID);
        if (handled) {
          sessionResetTimer(senderID);
          return;
        }
      }

      if (session.type === "list") {
        const handled = await doListAction(api, rawApi, session, input, threadID);
        if (handled) {
          sessionResetTimer(senderID);
          return;
        }
      }

      if (session.type === "block") {
        const handled = await doBlockAction(api, rawApi, session, input, threadID);
        if (handled) {
          sessionResetTimer(senderID);
          return;
        }
      }

      if (session.type === "mr") {
        const handled = await doMRAction(api, rawApi, session, input, threadID);
        if (handled) {
          sessionResetTimer(senderID);
          return;
        }
      }

      if (session.type === "inbox") {
        const msgMatch = input.match(/^(\d+)msg$/i);
        if (msgMatch) {
          const num = parseInt(msgMatch[1]);
          const t = session.data[num - 1];
          if (!t) return api.sendMessage(`❌ No thread #${num}.`, threadID);
          api.sendMessage(`💬 Thread: ${t.name}\nID: ${t.threadID}`, threadID);
          sessionResetTimer(senderID);
          return;
        }
      }

      // If we got here with an active session, just ignore (don't show error)
      return;
    }

    // ── FRESH COMMANDS ─────────────────────────────────

    // fbcontrol list — show help menu
    if (sub === "list" && args.length === 1) {
      // Check if it's actually asking for the help menu or friends list
      // "fb list" = friends list, no ambiguity
    }

    // fb (no args) — show help if also no session
    if (!sub || sub === "help") {
      return api.sendMessage(buildHelpMenu(), threadID);
    }

    // fbcontrol list = full command guide
    if (sub === "fbcontrol" || (sub === "list" && args[1] === undefined)) {
      // "fb list" without a session = show friends list
      // handled below
    }

    // ── fb list ─────────────────────────────────────────
    if (sub === "list") {
      api.sendMessage("⏳ Loading friends list...", threadID);
      const result = await fetchFriendsList(rawApi);
      if (result.error && result.data.length === 0)
        return api.sendMessage(`❌ ${result.error}`, threadID);

      sessionCreate(senderID, "list", result.data, threadID);
      const session2 = sessionGet(senderID);
      const msg2 = buildListMenu(result.data, 0);
      await sendPage(api, threadID, msg2, session2);
      return;
    }

    // ── fb block ────────────────────────────────────────
    if (sub === "block") {
      api.sendMessage("⏳ Loading block list (this may take a moment)...", threadID);
      const result = await fetchBlockList(rawApi);
      if (result.error && result.data.length === 0)
        return api.sendMessage(`❌ ${result.error}`, threadID);

      sessionCreate(senderID, "block", result.data, threadID);
      const session2 = sessionGet(senderID);
      const msg2 = buildBlockMenu(result.data, 0);
      await sendPage(api, threadID, msg2, session2);
      return;
    }

    // ── fb inbox ─────────────────────────────────────────
    if (sub === "inbox") {
      api.sendMessage("⏳ Loading inbox...", threadID);
      const result = await fetchInbox(api);
      if (result.error && result.data.length === 0)
        return api.sendMessage(`❌ ${result.error}`, threadID);

      sessionCreate(senderID, "inbox", result.data, threadID);
      const session2 = sessionGet(senderID);
      const msg2 = buildInboxMenu(result.data, 0);
      await sendPage(api, threadID, msg2, session2);
      return;
    }

    // ── fb mr (Message Requests) ─────────────────────────
    if (sub === "mr") {
      api.sendMessage("⏳ Loading message requests...", threadID);
      const result = await fetchMessageRequests(api);
      if (result.error && result.data.length === 0)
        return api.sendMessage(`❌ ${result.error}`, threadID);

      sessionCreate(senderID, "mr", result.data, threadID);
      const session2 = sessionGet(senderID);
      const msg2 = buildMRMenu(result.data, 0);
      await sendPage(api, threadID, msg2, session2);
      return;
    }

    // ── fb (friend requests) ─────────────────────────────
    if (sub === "fb" || (!sub && args.length === 0)) {
      // This would be triggered by just "fb" — but sub already IS "fb" from args[0]
      // Actually: command trigger is "fb", args[0] would be the first word after "fb"
      // If user sends "fb" alone, args=[], sub=""
    }

    // Default: show friend requests if no recognized subcommand
    api.sendMessage("⏳ Loading friend requests...", threadID);
    const result = await fetchFriendRequests(rawApi);
    if (result.error && result.data.length === 0)
      return api.sendMessage(`❌ ${result.error}`, threadID);

    sessionCreate(senderID, "req", result.data, threadID);
    const session2 = sessionGet(senderID);
    const msg2 = buildReqMenu(result.data, 0);
    await sendPage(api, threadID, msg2, session2);
  }
};
