/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║        FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK        ║
 * ║  Command: fbcontrol  |  Aliases: fb, fbc, fbm            ║
 * ║  Version: 3.3.0                                          ║
 * ╚══════════════════════════════════════════════════════════╝
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

// ─────────────────────────────────────────────
//  BOLD UNICODE HELPER
// ─────────────────────────────────────────────
const BOLD_MAP = {
  A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',
  N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭',
  a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',
  n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',
  '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'
};
function B(str) {
  return String(str).split('').map(c => BOLD_MAP[c] || c).join('');
}

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
    type, data, page: 0, authorID: String(authorID), threadID,
    lastMsgID: null, timer, smsAll: null, ...extra
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
//  UNSEND HELPER
// ─────────────────────────────────────────────
function unsendMsg(api, msgID) {
  if (!msgID) return;
  try { if (typeof api.unsendMessage === "function") api.unsendMessage(msgID, () => {}); } catch (_) {}
}

// ─────────────────────────────────────────────
//  SEND PAGE
//  Registers msgID into replyManager + reactionManager so
//  the Riyad Bot V2 framework routes replies & reactions here.
// ─────────────────────────────────────────────
async function sendPage(api, threadID, text, session, replyManager, reactionManager) {
  if (session.lastMsgID) {
    try { replyManager.delete(session.lastMsgID); } catch (_) {}
    unsendMsg(api, session.lastMsgID);
    session.lastMsgID = null;
  }

  return new Promise((resolve) => {
    api.sendMessage(text, threadID, (err, info) => {
      if (!err && info && info.messageID) {
        session.lastMsgID = info.messageID;
        const payload = { commandName: "fbcontrol", authorID: session.authorID, sessionType: session.type };
        try { replyManager.set(info.messageID, payload); } catch (_) {}
        try { reactionManager.register(info.messageID, payload); } catch (_) {}
      }
      resolve(info);
    });
  });
}

// ─────────────────────────────────────────────
//  PROFILE PICTURE HELPER (same method as pp.js)
// ─────────────────────────────────────────────
async function sendProfileCard(api, uid, name, vanity, threadID) {
  const cacheDir = path.join(__dirname, "cache");
  await fs.ensureDir(cacheDir);
  const filePath = path.join(cacheDir, `fbctrl_pp_${uid}_${Date.now()}.jpg`);
  const profileUrl = vanity
    ? `https://www.facebook.com/${vanity}`
    : `https://www.facebook.com/profile.php?id=${uid}`;

  try {
    const ppUrl = `https://graph.facebook.com/${uid}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
    const res = await axios.get(ppUrl, { responseType: "arraybuffer", timeout: 8000 });
    await fs.writeFile(filePath, res.data);

    const infoText =
      `👤 ${B(name)}\n` +
      `🆔 ${B("UID")}: ${uid}\n` +
      `🔗 ${profileUrl}`;

    await new Promise((resolve) =>
      api.sendMessage({ body: infoText, attachment: fs.createReadStream(filePath) }, threadID, () => {
        resolve();
        fs.remove(filePath).catch(() => {});
      })
    );
  } catch (_) {
    const infoText =
      `👤 ${B(name)}\n` +
      `🆔 ${B("UID")}: ${uid}\n` +
      `🔗 ${profileUrl}\n` +
      `⚠️ Profile picture unavailable`;
    api.sendMessage(infoText, threadID);
  }
}

// ─────────────────────────────────────────────
//  UI BUILDERS
// ─────────────────────────────────────────────
const D = "━━━━━━━━━━━━━━━━━━━━━━";

function buildHelpMenu() {
  return (
`╔══════════════════════════╗
║  ${B("📘 FB CONTROL — COMMANDS")}  ║
╚══════════════════════════╝

${D}
${B("📋 AVAILABLE COMMANDS")}
${D}

📩 fb
   └ ${B("list commands & menus")}

👥 fb list
   └ ${B("Friends List Manager")}
   └ ${B("Accept / Unfriend / Block / Message")}

🚫 fb block
   └ ${B("Block List Manager")}
   └ ${B("View & Unblock users")}

📨 fb inbox
   └ ${B("Recent DM Conversations")}

📬 fb mr
   └ ${B("Message Requests (OTHER/PENDING)")}
   └ ${B("Accept / Delete / Block")}

📤 fb sms <n> / <uid> <text>
   └ ${B("DM a specific friend by number or UID")}

📤 fb sms reply <text>
   └ ${B("Reply to last DM thread")}

📢 fb sms all <text>
   └ ${B("Broadcast to ALL friends")}
   └ ${B("Reply \"off\" to cancel")}

${D}
${B("🕹️ NAVIGATION (reply to bot's menu OR react)")}
${D}
  ❤️ React  → ${B("Next page")}
  Reply: 0  → ${B("Previous page")}
  Reply: <n>       → ${B("View profile + picture")}
  Reply: <n>a      → ${B("Add/Send friend request")}
  Reply: <n>d      → ${B("Delete / Reject")}
  Reply: <n>b      → ${B("Block")}
  Reply: <n>uf     → ${B("Unfriend (list)")}
  Reply: <n>bl     → ${B("Block (list)")}
  Reply: <n>u      → ${B("Unblock (block list)")}
  Reply: <n>msg [text] → ${B("Open / Send message")}
  Reply: bulk a/d/b/uf/bl/u → ${B("Bulk actions")}
  Reply: s <name>  → ${B("Search (list only)")}
  Reply: sort az / sort new → ${B("Sort (list)")}
${D}`
  );
}

function buildReqMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  ${B("📩 FRIEND REQUESTS")}       ║\n`;
  msg += `║  ${B("Page")} ${B(String(page + 1))} / ${B(String(tp))} │ ${B("Total:")} ${B(String(requests.length))}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No friend requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      const num = start + i + 1;
      msg += `\n${B(String(num))}. 👤 ${B(r.name)}\n`;
      msg += `   🆔 UID: ${r.uid}\n`;
      msg += `   🔗 fb.com/${r.uid}\n`;
      msg += `   ✅a  ❌d  🚫b\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${B("🕹️ CONTROLS")} (reply to this msg)\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;
  if (page + 1 >= tp) {
    msg += `👍✅ ${B("এটাই শেষ পেজ — আর পেজ নেই")}\n`;
  } else {
    msg += `  ❤️ React → ${B("Next")}   📩 Reply 0 → ${B("Prev")}\n`;
  }
  return msg;
}

function buildListMenu(friends, page) {
  const tp = Math.max(1, Math.ceil(friends.length / PER_PAGE));
  const items = friends.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  ${B("👥 FRIENDS LIST")}          ║\n`;
  msg += `║  ${B("Page")} ${B(String(page + 1))} / ${B(String(tp))} │ ${B("Total:")} ${B(String(friends.length))}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No friends found.\n\n`;
  } else {
    items.forEach((f, i) => {
      const num = start + i + 1;
      msg += `\n${B(String(num))}. 👤 ${B(f.fullName)}\n`;
      msg += `   🆔 UID: ${f.userID}\n`;
      msg += `   🔗 ${f.profileUrl || `https://www.facebook.com/profile.php?id=${f.userID}`}\n`;
      msg += `   ✅a  💬msg  🚫bl  ❌uf\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${B("🕹️ CONTROLS")} (reply to this msg)\n`;
  msg += `  <n>msg [text]  — ${B("open / send msg")}\n`;
  msg += `  <n>uf ${B("Unfriend")}  <n>bl ${B("Block")}\n`;
  msg += `  <n>a ${B("Accept")}  <n> ${B("View Profile")}\n`;
  msg += `  s <name> → ${B("Search")}\n`;
  msg += `  sort az / sort new\n`;
  msg += `${D}\n`;
  if (page + 1 >= tp) {
    msg += `👍✅ ${B("এটাই শেষ পেজ — আর পেজ নেই")}\n`;
  } else {
    msg += `  ❤️ React → ${B("Next")}   📩 Reply 0 → ${B("Prev")}\n`;
  }
  return msg;
}

function buildBlockMenu(blocked, page) {
  const tp = Math.max(1, Math.ceil(blocked.length / PER_PAGE));
  const items = blocked.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  ${B("🚫 BLOCK LIST")}            ║\n`;
  msg += `║  ${B("Page")} ${B(String(page + 1))} / ${B(String(tp))} │ ${B("Total:")} ${B(String(blocked.length))}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No blocked users.\n\n`;
  } else {
    items.forEach((u, i) => {
      const num = start + i + 1;
      msg += `\n${B(String(num))}. 👤 ${B(u.name)}\n`;
      msg += `   🆔 UID: ${u.uid}\n`;
      msg += `   ✅u Unblock  💬msg\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${B("🕹️ CONTROLS")} (reply to this msg)\n`;
  msg += `  <n>u Unblock  <n>msg Message\n`;
  msg += `  bulk u → Bulk unblock\n`;
  msg += `${D}\n`;
  if (page + 1 >= tp) {
    msg += `👍✅ ${B("এটাই শেষ পেজ — আর পেজ নেই")}\n`;
  } else {
    msg += `  ❤️ React → ${B("Next")}   📩 Reply 0 → ${B("Prev")}\n`;
  }
  return msg;
}

function buildInboxMenu(threads, page) {
  const tp = Math.max(1, Math.ceil(threads.length / PER_PAGE));
  const items = threads.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  ${B("📨 INBOX")}                 ║\n`;
  msg += `║  ${B("Page")} ${B(String(page + 1))} / ${B(String(tp))} │ ${B("Total:")} ${B(String(threads.length))}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 Inbox is empty.\n\n`;
  } else {
    items.forEach((t, i) => {
      const num = start + i + 1;
      const name = t.name || `Thread ${t.threadID}`;
      msg += `\n${B(String(num))}. ${t.isGroup ? "👥" : "👤"} ${B(name)}\n`;
      msg += `   🆔 ${t.threadID}\n`;
      if (t.snippet) msg += `   💬 "${t.snippet.substring(0, 30)}"\n`;
      msg += `   📤 <n>msg [text] to open/send\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${B("🕹️ CONTROLS")} (reply to this msg)\n`;
  msg += `  <n>msg [text] → Open / Send\n`;
  msg += `${D}\n`;
  if (page + 1 >= tp) {
    msg += `👍✅ ${B("এটাই শেষ পেজ — আর পেজ নেই")}\n`;
  } else {
    msg += `  ❤️ React → ${B("Next")}   📩 Reply 0 → ${B("Prev")}\n`;
  }
  return msg;
}

function buildMRMenu(requests, page) {
  const tp = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const items = requests.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const start = page * PER_PAGE;

  let msg = `╔══════════════════════════╗\n`;
  msg += `║  ${B("📬 MESSAGE REQUESTS")}      ║\n`;
  msg += `║  ${B("Page")} ${B(String(page + 1))} / ${B(String(tp))} │ ${B("Total:")} ${B(String(requests.length))}  ║\n`;
  msg += `╚══════════════════════════╝\n`;
  msg += `${D}\n`;

  if (items.length === 0) {
    msg += `\n  📭 No message requests.\n\n`;
  } else {
    items.forEach((r, i) => {
      const num = start + i + 1;
      const badge = r.isNew ? " 🆕" : "";
      const sectionBadge = r.section === "spam" ? " ⚠️SPAM" : r.section === "pending" ? " ⏳PENDING" : " 🤝OTHER";
      msg += `\n${B(String(num))}. ${r.isGroup ? "👥" : "👤"} ${B(r.name)}${badge}${sectionBadge}\n`;
      msg += `   🆔 ${r.threadID}\n`;
      if (r.snippet) msg += `   💬 "${r.snippet.substring(0, 28)}"\n`;
      msg += `   ✅a Accept  ❌d Delete  🚫b Block\n`;
    });
  }

  msg += `\n${D}\n`;
  msg += `${B("🕹️ CONTROLS")} (reply to this msg)\n`;
  msg += `  <n>a Accept  <n>d Delete  <n>b Block\n`;
  msg += `  bulk a / bulk d / bulk b\n`;
  msg += `${D}\n`;
  if (page + 1 >= tp) {
    msg += `👍✅ ${B("এটাই শেষ পেজ — আর পেজ নেই")}\n`;
  } else {
    msg += `  ❤️ React → ${B("Next")}   📩 Reply 0 → ${B("Prev")}\n`;
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
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": "https://www.facebook.com/",
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

    // Split at each "Confirm" link, look backward for the user link
    const chunks = html.split(/<a href="[^"]*confirm[^"]*">/i);
    for (let i = 0; i < chunks.length - 1; i++) {
      const linkRe = /href="\/(?:profile\.php\?id=)?([^"?&\/\n]{1,60})[^"]*"\s*[^>]*>([^<]{2,80})<\/a>/gi;
      let m, last = null;
      while ((m = linkRe.exec(chunks[i])) !== null) {
        const uid = m[1].replace(/^profile\.php\?id=/, "").split("?")[0].trim();
        const name = m[2].replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
        if (!uid || uid.includes("/") || ["friends","home","settings","requests"].includes(uid)) continue;
        if (name.length < 2 || name.length > 80) continue;
        last = { uid, name };
      }
      if (last && !results.find(r => r.uid === last.uid))
        results.push({ uid: last.uid, name: last.name });
    }

    // JSON fallback
    if (results.length === 0) {
      const jsonRe = /"userID"\s*:\s*"(\d+)"[^}]*?"name"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = jsonRe.exec(html)) !== null) {
        const uid = m[1];
        const name = m[2].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16))).trim();
        if (!results.find(r => r.uid === uid)) results.push({ uid, name });
      }
    }

    return { data: results, error: results.length === 0 ? "No pending friend requests found." : null };
  } catch (e) { return { data: [], error: e.message }; }
}

async function fetchFriendsList(rawApi) {
  return new Promise((resolve) => {
    if (typeof rawApi.getFriendsList !== "function")
      return resolve({ data: [], error: "getFriendsList is not available." });
    rawApi.getFriendsList((err, data) => {
      if (err) return resolve({ data: [], error: err.message || String(err) });
      const friends = Object.values(data || {}).map(f => ({
        userID: f.userID,
        fullName: f.fullName || f.name || "Unknown",
        profileUrl: f.profileUrl || `https://www.facebook.com/profile.php?id=${f.userID}`,
        vanity: f.vanity || null
      }));
      resolve({ data: friends, error: null });
    });
  });
}

async function fetchBlockList(rawApi) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) return { data: [], error: "Could not read cookies." };
  for (const url of ["https://mbasic.facebook.com/settings/blocking/", "https://m.facebook.com/settings/blocking/"]) {
    try {
      const res = await httpsGet(url, cookieStr);
      const html = res.body || "";
      if (res.status !== 200 || html.length < 500) continue;
      const results = [];
      const unblockSplit = html.split(/Unblock/i);
      for (let i = 0; i < unblockSplit.length - 1; i++) {
        const searchIn = unblockSplit[i].slice(-800);
        const linkRe = /href="\/(?:profile\.php\?id=)?([^"?&\/\n]{1,60})[^"]*"\s*[^>]*>([^<]{2,80})<\/a>/gi;
        let m, last = null;
        while ((m = linkRe.exec(searchIn)) !== null) {
          const uid = m[1].replace(/^profile\.php\?id=/, "").split("?")[0].trim();
          const name = m[2].replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
          if (!uid || uid.includes("/") || ["settings","home"].includes(uid)) continue;
          if (name.length < 2 || name.length > 80) continue;
          last = { uid, name };
        }
        if (last && !results.find(r => r.uid === last.uid)) results.push(last);
      }
      if (results.length === 0) {
        const jsonPatterns = [/"uid"\s*:\s*"?(\d+)"?[^}]{0,200}"name"\s*:\s*"([^"]+)"/g];
        for (const re of jsonPatterns) {
          let m;
          while ((m = re.exec(html)) !== null) {
            const uid = m[1];
            const name = m[2].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16))).trim();
            if (!results.find(r => r.uid === uid)) results.push({ uid, name });
          }
        }
      }
      if (results.length > 0) return { data: results, error: null };
    } catch (_) {}
  }
  return { data: [], error: "Block list could not be loaded. Facebook may have changed its page format." };
}

async function fetchInbox(api) {
  // getThreadList on the Riyad Bot V2 adapter is Promise-based (no callback)
  try {
    if (typeof api.getThreadList !== "function")
      return { data: [], error: "getThreadList not available." };
    const threads = await api.getThreadList(30, null, []) || [];
    return {
      data: threads.map(t => ({
        threadID: t.threadID, name: t.name || t.threadID,
        isGroup: t.isGroup || false, snippet: t.snippet || ""
      })),
      error: null
    };
  } catch (e) {
    return { data: [], error: e.message || String(e) };
  }
}

// fetch message requests from OTHER + PENDING folders — adapter is Promise-based
async function fetchMessageRequests(api) {
  try {
    if (typeof api.getThreadList !== "function")
      return { data: [], error: "getThreadList not available." };

    const [other, pending, spam] = await Promise.all([
      api.getThreadList(50, null, ["OTHER"]).catch(() => []),
      api.getThreadList(50, null, ["PENDING"]).catch(() => []),
      api.getThreadList(20, null, ["SPAM"]).catch(() => [])
    ]);

    const all = [
      ...buildMRList(other || [], "you_may_know"),
      ...buildMRList(pending || [], "pending"),
      ...buildMRList(spam || [], "spam")
    ];

    if (all.length === 0)
      return { data: [], error: "No message requests found in OTHER / PENDING / SPAM folders." };
    return { data: all, error: null };
  } catch (e) {
    return { data: [], error: e.message || String(e) };
  }
}

function buildMRList(threads, section) {
  return threads.map(t => ({
    threadID: t.threadID, name: t.name || t.threadID,
    isGroup: t.isGroup || false, snippet: t.snippet || "",
    isNew: t.isSubscribed === false || t.readStatus === false,
    section
  }));
}

// ─────────────────────────────────────────────
//  SEND FRIEND REQUEST via mbasic HTTP
// ─────────────────────────────────────────────
async function sendFriendRequest(rawApi, uid) {
  if (typeof rawApi.addFriend === "function") {
    return new Promise((res, rej) => rawApi.addFriend(uid, e => e ? rej(e) : res()));
  }
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) throw new Error("Cookie unavailable");
  const res = await httpsGet(`https://mbasic.facebook.com/profile.php?id=${uid}`, cookieStr);
  const html = res.body || "";
  const patterns = [
    /href="(\/[^"]*(?:add_friend|friend_add|befriend)[^"]*?)"/i,
    /href="(https:\/\/[^"]*(?:add_friend|friend_add)[^"]*?)"/i
  ];
  let addUrl = null;
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) { addUrl = m[1].startsWith("http") ? m[1] : `https://mbasic.facebook.com${m[1]}`; break; }
  }
  if (!addUrl) throw new Error("Add friend link not found on profile page");
  const addRes = await httpsGet(addUrl, cookieStr);
  if (addRes.status < 200 || addRes.status >= 400) throw new Error(`HTTP ${addRes.status}`);
}

// ─────────────────────────────────────────────
//  ACTION HANDLERS
// ─────────────────────────────────────────────

// fca-riyad handleFriendRequest uses BOOLEAN (true=confirm, false=reject)
function callFriendAction(rawApi, uid, accept) {
  return new Promise((resolve, reject) => {
    if (typeof rawApi.handleFriendRequest === "function") {
      rawApi.handleFriendRequest(uid, accept, (err) => err ? reject(err) : resolve());
    } else {
      reject(new Error("handleFriendRequest not available"));
    }
  });
}

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
        else if (action === "b") await new Promise((res, rej) => rawApi.changeBlockedStatus(r.uid, true, e => e ? rej(e) : res()));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(r => !pageItems.find(p => p.uid === r.uid));
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
      await callFriendAction(rawApi, target.uid, true);
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`✅ Accepted: ${target.name}`, threadID);
    } else if (action === "d") {
      await callFriendAction(rawApi, target.uid, false);
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`🗑️ Deleted: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.uid, true, e => e ? rej(e) : res()));
      session.data = items.filter(r => r.uid !== target.uid);
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
  } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
  return true;
}

async function doListAction(api, rawApi, session, input, threadID, replyManager, reactionManager) {
  const items = session.data;

  // Number-only → show profile + picture
  const numOnly = input.match(/^(\d+)$/);
  if (numOnly) {
    const num = parseInt(numOnly[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    api.sendMessage(`⏳ Loading profile...`, threadID);
    await sendProfileCard(api, target.userID, target.fullName, target.vanity, threadID);
    return true;
  }

  // <n>msg [text]
  const msgMatch = input.match(/^(\d+)msg(?:\s+(.+))?$/i);
  if (msgMatch) {
    const num = parseInt(msgMatch[1]);
    const msgText = (msgMatch[2] || "").trim();
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    if (msgText) {
      // Actually send the message to that friend
      try {
        await new Promise((res, rej) => api.sendMessage(msgText, target.userID, e => e ? rej(e) : res()));
        api.sendMessage(`✅ Message sent to ${target.fullName}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send: ${e.message || String(e)}`, threadID); }
    } else {
      api.sendMessage(`💬 ${B(target.fullName)}\n🆔 UID: ${target.userID}\n📤 Reply: <n>msg <text> to send`, threadID);
    }
    return true;
  }

  // <n>a → accept friend request from this person
  const addMatch = input.match(/^(\d+)a$/i);
  if (addMatch) {
    const num = parseInt(addMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    try {
      await callFriendAction(rawApi, target.userID, true);
      api.sendMessage(`✅ Accepted: ${target.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Accept failed for ${target.fullName}: ${e.message}`, threadID); }
    return true;
  }

  // <n>uf
  const ufMatch = input.match(/^(\d+)uf$/i);
  if (ufMatch) {
    const num = parseInt(ufMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.unfriend(target.userID, e => e ? rej(e) : res()));
      session.data = items.filter(f => f.userID !== target.userID);
      api.sendMessage(`✅ Unfriended: ${target.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }

  // <n>bl
  const blMatch = input.match(/^(\d+)bl$/i);
  if (blMatch) {
    const num = parseInt(blMatch[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.userID, true, e => e ? rej(e) : res()));
      session.data = items.filter(f => f.userID !== target.userID);
      api.sendMessage(`🚫 Blocked: ${target.fullName}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }

  // bulk
  const bulkMatch = input.match(/^bulk\s+(uf|bl)$/i);
  if (bulkMatch) {
    const action = bulkMatch[1].toLowerCase();
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const f of pageItems) {
      try {
        if (action === "uf") await new Promise((res, rej) => rawApi.unfriend(f.userID, e => e ? rej(e) : res()));
        else if (action === "bl") await new Promise((res, rej) => rawApi.changeBlockedStatus(f.userID, true, e => e ? rej(e) : res()));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(f => !pageItems.find(p => p.userID === f.userID));
    api.sendMessage(`✅ Bulk ${action === "uf" ? "Unfriended" : "Blocked"}: ${done} done.`, threadID);
    return true;
  }

  // search
  const searchMatch = input.match(/^s\s+(.+)$/i);
  if (searchMatch) {
    const q = searchMatch[1].toLowerCase();
    const found = items.filter(f => f.fullName.toLowerCase().includes(q));
    api.sendMessage(
      `🔍 Found ${found.length} result(s) for "${searchMatch[1]}":\n\n` +
      (found.length === 0 ? "  Nobody found." : found.slice(0, 10).map((f, i) => `${i + 1}. ${f.fullName} (${f.userID})`).join("\n")),
      threadID
    );
    return true;
  }

  // sort
  const sortMatch = input.match(/^sort\s+(az|new)$/i);
  if (sortMatch) {
    session.data = sortMatch[1] === "az"
      ? [...items].sort((a, b) => a.fullName.localeCompare(b.fullName))
      : [...items].reverse();
    session.page = 0;
    await sendPage(api, threadID, buildListMenu(session.data, 0), session, replyManager, reactionManager);
    return true;
  }

  return false;
}

async function doBlockAction(api, rawApi, session, input, threadID) {
  const uMatch = input.match(/^(\d+)u$/i);
  const msgMatch = input.match(/^(\d+)msg(?:\s+(.+))?$/i);
  const bulkMatch = input.match(/^bulk\s+u$/i);
  if (!uMatch && !msgMatch && !bulkMatch) return false;
  const items = session.data;

  if (bulkMatch) {
    const pageItems = items.slice(session.page * PER_PAGE, (session.page + 1) * PER_PAGE);
    let done = 0;
    for (const u of pageItems) {
      try { await new Promise((res, rej) => rawApi.changeBlockedStatus(u.uid, false, e => e ? rej(e) : res())); done++; } catch (_) {}
    }
    session.data = items.filter(u => !pageItems.find(p => p.uid === u.uid));
    api.sendMessage(`✅ Bulk Unblocked: ${done} done.`, threadID);
    return true;
  }
  if (uMatch) {
    const num = parseInt(uMatch[1]); const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No user #${num}.`, threadID); return true; }
    try {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.uid, false, e => e ? rej(e) : res()));
      session.data = items.filter(u => u.uid !== target.uid);
      api.sendMessage(`✅ Unblocked: ${target.name}`, threadID);
    } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
    return true;
  }
  if (msgMatch) {
    const num = parseInt(msgMatch[1]); const msgText = (msgMatch[2] || "").trim();
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No user #${num}.`, threadID); return true; }
    if (msgText) {
      try {
        await new Promise((res, rej) => api.sendMessage(msgText, target.uid, e => e ? rej(e) : res()));
        api.sendMessage(`✅ Message sent to ${target.name}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed: ${e.message}`, threadID); }
    } else {
      api.sendMessage(`💬 ${B(target.name)}\n🆔 UID: ${target.uid}`, threadID);
    }
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
        if (action === "d" && typeof rawApi.deleteThread === "function")
          await new Promise(res => rawApi.deleteThread(r.threadID, res));
        else if (action === "b")
          await new Promise((res, rej) => rawApi.changeBlockedStatus(r.threadID, true, e => e ? rej(e) : res()));
        done++;
      } catch (_) {}
    }
    session.data = items.filter(r => !pageItems.find(p => p.threadID === r.threadID));
    api.sendMessage(`✅ Bulk ${action === "a" ? "Accepted" : action === "d" ? "Deleted" : "Blocked"}: ${done} done.`, threadID);
    return true;
  }

  const num = parseInt(match[1]); const action = match[2].toLowerCase();
  const target = items[num - 1];
  if (!target) { api.sendMessage(`❌ No request #${num}.`, threadID); return true; }
  try {
    if (action === "a") {
      api.sendMessage(`✅ Accepted: ${target.name}\nYou can now message them.`, threadID);
      session.data = items.filter(r => r.threadID !== target.threadID);
    } else if (action === "d") {
      if (typeof rawApi.deleteThread === "function")
        await new Promise(res => rawApi.deleteThread(target.threadID, res));
      session.data = items.filter(r => r.threadID !== target.threadID);
      api.sendMessage(`🗑️ Deleted: ${target.name}`, threadID);
    } else if (action === "b") {
      await new Promise((res, rej) => rawApi.changeBlockedStatus(target.threadID, true, e => e ? rej(e) : res()));
      session.data = items.filter(r => r.threadID !== target.threadID);
      api.sendMessage(`🚫 Blocked: ${target.name}`, threadID);
    }
  } catch (e) { api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID); }
  return true;
}

// ─────────────────────────────────────────────
//  NAVIGATION HELPER
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
  if (text) { await sendPage(api, session.threadID, text, session, replyManager, reactionManager); sessionResetTimer(session.authorID); }
  return true;
}

// ─────────────────────────────────────────────
//  SHARED SESSION INPUT HANDLER
// ─────────────────────────────────────────────
async function handleSessionInput(api, rawApi, session, input, senderID, threadID, replyManager, reactionManager) {
  sessionResetTimer(senderID);

  if (input === "0") { await navigatePage(api, session, -1, replyManager, reactionManager); return true; }

  if (input === "off" && session.smsAll) {
    session.smsAll.cancelled = true;
    sessionClear(senderID);
    api.sendMessage("📴 Broadcast cancelled.", threadID);
    return true;
  }

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
    const msgMatch = input.match(/^(\d+)msg(?:\s+(.+))?$/i);
    if (msgMatch) {
      const num = parseInt(msgMatch[1]);
      const msgText = (msgMatch[2] || "").trim();
      const t = session.data[num - 1];
      if (!t) { api.sendMessage(`❌ No thread #${num}.`, threadID); return true; }
      if (msgText) {
        try {
          await new Promise((res, rej) => api.sendMessage(msgText, t.threadID, e => e ? rej(e) : res()));
          api.sendMessage(`✅ Sent to ${t.name}`, threadID);
        } catch (e) { api.sendMessage(`❌ Failed: ${e.message}`, threadID); }
      } else {
        api.sendMessage(`💬 ${B(t.name)}\n🆔 ${t.threadID}`, threadID);
      }
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
//  SMS ALL BROADCAST
// ─────────────────────────────────────────────
async function runSmsAll(api, rawApi, threadID, text, authorID) {
  const result = await fetchFriendsList(rawApi);
  if (result.error || result.data.length === 0)
    return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);

  const friends = result.data;
  const state = { cancelled: false };
  sessionCreate(authorID, "sms_all", [], threadID, { smsAll: state });

  const statusInfo = await new Promise(res =>
    api.sendMessage(`📢 Sending to ${friends.length} friends...\n0/${friends.length} done`, threadID, (e, i) => res(i))
  );
  const statusMsgID = statusInfo ? statusInfo.messageID : null;

  let sent = 0;
  for (const friend of friends) {
    if (state.cancelled) break;
    try {
      await new Promise(res => api.sendMessage(text, friend.userID, (e, i) => res(i)));
      sent++;
      if (statusMsgID && sent % 5 === 0)
        api.sendMessage(`📢 Sending...\n${sent}/${friends.length} done`, threadID);
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }

  api.sendMessage(
    state.cancelled
      ? `📴 Broadcast cancelled. Sent: ${sent}/${friends.length}`
      : `✅ Broadcast complete!\n📤 Sent to: ${sent}/${friends.length} friends`,
    threadID
  );
  if (statusMsgID) try { api.unsendMessage(statusMsgID, () => {}); } catch (_) {}
  sessionClear(authorID);
}

// ─────────────────────────────────────────────
//  MODULE EXPORT
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fb", "fbc", "fbm"],
    version: "3.3.0",
    author: "Riyad Bot Team",
    countDown: 3,
    role: 2,
    shortDescription: "Facebook Account Manager",
    longDescription: "Manage friend requests, friends list, block list, inbox, and message requests.",
    category: "account",
    guide: { en: "fb | fb list | fb block | fb inbox | fb mr | fb sms <n|uid> <text> | fb sms all <text>" }
  },

  // ❤️ REACTION → next page
  onReaction: async function({ api, event, Reaction, reactionData, replyManager, reactionManager }) {
    try {
      const { userID, messageID } = event;
      // authorID stored when we registered the message
      const authorID = (Reaction && Reaction.authorID) || (reactionData && reactionData.authorID) || userID;
      const session = sessionGet(authorID);
      if (!session) return;
      if (session.lastMsgID !== messageID) return;
      if (["req", "list", "block", "inbox", "mr"].includes(session.type))
        await navigatePage(api, session, 1, replyManager, reactionManager);
    } catch (err) { console.error("[fbcontrol] onReaction error:", err); }
  },

  // 📩 REPLY → navigation & actions
  onReply: async function({ api, event, Reply, replyData, replyManager, reactionManager }) {
    try {
      const { senderID, threadID, body } = event;
      const rawApi = getRawApi(api);
      // authorID stored when we registered the message
      const authorID = (Reply && Reply.authorID) || (replyData && replyData.authorID) || senderID;
      const session = sessionGet(authorID);
      if (!session) return;
      const input = (body || "").trim().toLowerCase();
      if (!input) return;
      await handleSessionInput(api, rawApi, session, input, authorID, threadID, replyManager, reactionManager);
    } catch (err) { console.error("[fbcontrol] onReply error:", err); }
  },

  // MAIN COMMAND ENTRY (Riyad Bot V2 uses onStart)
  onStart: async function({ api, event, args, replyManager, reactionManager }) {
    try {
      await handleRun({ api, event, args, replyManager, reactionManager });
    } catch (err) {
      console.error("[fbcontrol] Uncaught error in onStart():", err);
      try { api.sendMessage(`❌ fbcontrol error: ${err && err.message ? err.message : String(err)}`, event.threadID); } catch (_) {}
    }
  }
};

// ─────────────────────────────────────────────
//  MAIN COMMAND HANDLER
// ─────────────────────────────────────────────
async function handleRun({ api, event, args, replyManager, reactionManager }) {
  const { senderID, threadID, body } = event;
  const rawApi = getRawApi(api);
  const sub = (args[0] || "").toLowerCase();
  const session = sessionGet(senderID);

  // ── SMS COMMANDS ──────────────────────────
  if (sub === "sms") {
    const target = args[1];
    if (!target) return api.sendMessage("❌ Usage: fb sms <n|uid> <text>  OR  fb sms all <text>", threadID);

    if (target.toLowerCase() === "all") {
      const msg = args.slice(2).join(" ");
      if (!msg) return api.sendMessage("❌ Usage: fb sms all <text>", threadID);
      return await runSmsAll(api, rawApi, threadID, msg, senderID);
    }
    if (target.toLowerCase() === "off") {
      const s = sessionGet(senderID);
      if (s && s.smsAll) { s.smsAll.cancelled = true; sessionClear(senderID); return api.sendMessage("📴 Broadcast cancelled.", threadID); }
      return api.sendMessage("ℹ️ No active broadcast.", threadID);
    }

    const msg = args.slice(2).join(" ");
    if (!msg) return api.sendMessage("❌ Please include a message text.", threadID);

    // Support both number (friend index) and UID (long number)
    const n = parseInt(target);
    if (isNaN(n)) return api.sendMessage("❌ Usage: fb sms <number|uid> <text>", threadID);

    // If it's a short number (<= 5 digits), treat as friend list index; else treat as UID
    if (String(n).length <= 5) {
      const result = await fetchFriendsList(rawApi);
      if (result.error || !result.data.length)
        return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);
      const friend = result.data[n - 1];
      if (!friend) return api.sendMessage(`❌ No friend #${n}.`, threadID);
      try {
        await new Promise((res, rej) => api.sendMessage(msg, friend.userID, e => e ? rej(e) : res()));
        api.sendMessage(`✅ Message sent to ${friend.fullName}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send to ${friend.fullName}: ${e.message}`, threadID); }
    } else {
      // Treat as direct UID
      try {
        await new Promise((res, rej) => api.sendMessage(msg, String(n), e => e ? rej(e) : res()));
        api.sendMessage(`✅ Message sent to UID ${n}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send to UID ${n}: ${e.message}`, threadID); }
    }
    return;
  }

  // ── SESSION NAVIGATION (inline command while session active) ──
  if (session) {
    const rawInput = (body || "").trim().replace(/^(?:fbcontrol|fb\w*|fbc|fbm)\s*/i, "").trim().toLowerCase();
    const handled = await handleSessionInput(api, rawApi, session, rawInput, senderID, threadID, replyManager, reactionManager);
    if (handled) return;
    return;
  }

  // ── FRESH COMMANDS ────────────────────────
  if (!sub || sub === "help") return api.sendMessage(buildHelpMenu(), threadID);

  if (sub === "list") {
    api.sendMessage("⏳ Loading friends list...", threadID);
    const result = await fetchFriendsList(rawApi);
    if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
    sessionCreate(senderID, "list", result.data, threadID);
    await sendPage(api, threadID, buildListMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
    return;
  }

  if (sub === "block") {
    api.sendMessage("⏳ Loading block list...", threadID);
    const result = await fetchBlockList(rawApi);
    if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
    sessionCreate(senderID, "block", result.data, threadID);
    await sendPage(api, threadID, buildBlockMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
    return;
  }

  if (sub === "inbox") {
    api.sendMessage("⏳ Loading inbox...", threadID);
    const result = await fetchInbox(api);
    if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
    sessionCreate(senderID, "inbox", result.data, threadID);
    await sendPage(api, threadID, buildInboxMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
    return;
  }

  if (sub === "mr") {
    api.sendMessage("⏳ Loading message requests (OTHER + PENDING)...", threadID);
    const result = await fetchMessageRequests(api);
    if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
    sessionCreate(senderID, "mr", result.data, threadID);
    await sendPage(api, threadID, buildMRMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
    return;
  }

  // Default: friend requests
  api.sendMessage("⏳ Loading friend requests...", threadID);
  const result = await fetchFriendRequests(rawApi);
  if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
  sessionCreate(senderID, "req", result.data, threadID);
  await sendPage(api, threadID, buildReqMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
}
