/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         FACEBOOK ACCOUNT MANAGER — RIYAD FRAMEWORK           ║
 * ║  Command: fbcontrol  |  Aliases: fb, fbc, fbm                ║
 * ║  Version: 3.5.1                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * CHANGES IN 3.5.1 (this patch):
 *  - FIXED "fb sms" / "fb sms all": showed "✅ sent" but the message never
 *    actually arrived. Root cause: safeSendDM() called api.sendMessage()
 *    (the FcaMessengerAdapter wrapper). That wrapper's Promise resolves as
 *    soon as it hands the message to the outgoing queue/adapter layer, NOT
 *    when Facebook actually confirms delivery — so it can resolve
 *    successfully even when the underlying fca-riyad call silently failed
 *    or Facebook's spam/abuse system accepted-then-dropped it. There was
 *    also no logging of what the adapter actually returned, so failures
 *    were invisible.
 *
 *    FIX: safeSendDM() now calls rawApi.sendMessage() directly — the raw
 *    fca-riyad call with its real Node-style callback — which is the same
 *    call path fca-riyad itself uses to talk to Facebook, bypassing the
 *    adapter layer entirely. It also now logs the real messageID (or the
 *    real error) to the console for every send, and rejects with the ACTUAL
 *    error instead of silently resolving.
 *  - `fb sms all`: increased per-send delay (300ms → 1200ms) with a little
 *    random jitter, because sending 1 DM every 300ms to dozens/hundreds of
 *    friends in a row is exactly the pattern Facebook's spam filters flag
 *    and silently drop — even though the API call itself reports success.
 *  - `fb sms all`: now reports sent vs. genuinely-failed counts separately,
 *    and prints the failed friends' names/UIDs so you can see exactly who
 *    didn't get it and why (from the real error message).
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
//  api = FcaMessengerAdapter  |  api.api = raw fca-riyad object
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
//  LAST DM THREAD TRACKER (per bot-command author)
//  Used by `fb sms reply <text>` to know where to send.
// ─────────────────────────────────────────────
const LAST_DM_THREAD = new Map();
function setLastDmThread(authorID, threadID, name) {
  LAST_DM_THREAD.set(String(authorID), { threadID: String(threadID), name: name || String(threadID) });
}
function getLastDmThread(authorID) {
  return LAST_DM_THREAD.get(String(authorID)) || null;
}

// ─────────────────────────────────────────────
//  UNSEND HELPER
// ─────────────────────────────────────────────
function unsendMsg(api, msgID) {
  if (!msgID) return;
  try { if (typeof api.unsendMessage === "function") api.unsendMessage(msgID, () => {}); } catch (_) {}
}

// ─────────────────────────────────────────────
//  SAFE DM SEND HELPER  ★★★ FIXED IN 3.5.1 ★★★
//
//  OLD (broken): `return await api.sendMessage(text, threadID);`
//  This called the FcaMessengerAdapter wrapper, whose Promise can resolve
//  successfully without the message ever actually reaching Facebook (queue
//  hand-off vs real delivery), and gave zero visibility into what happened.
//
//  NEW: call rawApi.sendMessage() directly — fca-riyad's real callback-based
//  send, the same one every other working command in this framework relies
//  on for real delivery. We wrap it in a Promise ourselves so the calling
//  code can still `await` it, but the resolve/reject now reflects fca-riyad's
//  ACTUAL callback result, not the adapter's queue hand-off. Every call also
//  logs the outcome so failures are visible in the server log instead of
//  silently vanishing.
// ─────────────────────────────────────────────
async function safeSendDM(api, text, threadID) {
  const rawApi = getRawApi(api);
  if (typeof rawApi.sendMessage !== "function") {
    throw new Error("rawApi.sendMessage is not available — cannot send DM.");
  }
  return await new Promise((resolve, reject) => {
    rawApi.sendMessage(text, threadID, (err, info) => {
      if (err) {
        console.error(`[fbcontrol] DM send FAILED → ${threadID}:`, err && err.message ? err.message : err);
        return reject(err instanceof Error ? err : new Error(String(err)));
      }
      if (!info || !info.messageID) {
        // fca-riyad returned no error but also no messageID — treat as
        // suspicious rather than silently declaring success.
        console.warn(`[fbcontrol] DM send to ${threadID} returned no messageID — Facebook may have silently rejected it. info:`, JSON.stringify(info));
        return reject(new Error("No messageID returned — Facebook likely rejected the message silently (possible spam/rate-limit block)."));
      }
      console.log(`[fbcontrol] DM sent OK → ${threadID} | messageID: ${info.messageID}`);
      resolve(info);
    });
  });
}

// ─────────────────────────────────────────────
//  SEND PAGE
//
//  KEY FIX (kept from 3.5.0): Use await api.sendMessage() (Promise, NO callback)
//  for the paginated menu messages specifically — this one is fine to keep on
//  the adapter because it's about reactionManager/replyManager registration
//  timing, not delivery confirmation, and the adapter form is what makes the
//  ❤️/reply navigation work correctly. Only real outbound DMs (safeSendDM)
//  needed to move to the raw callback path.
// ─────────────────────────────────────────────
async function sendPage(api, threadID, text, session, replyManager, reactionManager) {
  if (session.lastMsgID) {
    try { replyManager.delete(session.lastMsgID); } catch (_) {}
    unsendMsg(api, session.lastMsgID);
    session.lastMsgID = null;
  }

  try {
    const info = await api.sendMessage(text, threadID);
    if (info && info.messageID) {
      session.lastMsgID = info.messageID;
      const payload = {
        commandName: "fbcontrol",
        authorID: session.authorID,
        sessionType: session.type
      };
      try { replyManager.set(info.messageID, payload); } catch (_) {}
      try { reactionManager.register(info.messageID, payload); } catch (_) {}
    }
    return info;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────
//  PROFILE PICTURE CARD HELPER
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
`╭───────────────────╮
          📘 𝗙𝗕 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 📘
           ✦ ᴏꜰꜰɪᴄɪᴀʟ ᴍᴇɴᴜ ✦
╰───────────────────╯

━━ ◈ 📋 𝗔𝗟𝗟 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 ◈ ━━

📩 │ fb
   └─ 🗂️ List commands & menus

👥 │ fb list
   └─ 👫 Friends List Manager
   └─ ✅ Accept • ❌ Unfriend • 🚫 Block • 💬 Message

📨 │ fb inbox
   └─ 💬 Recent DM conversations

📬 │ fb mr
   └─ 📥 Message Requests (OTHER/PENDING)
   └─ ✅ Accept • 🗑️ Delete • 🚫 Block

📤 │ fb sms <n> / <uid> <text>
   └─ ✉️ DM a specific friend by number or UID

📤 │ fb sms reply <text>
   └─ ↩️ Reply to last DM thread

📢 │ fb sms all <text>
   └─ 📡 Broadcast to ALL friends
   └─ ⛔ Reply "off" to cancel

👤 │ fb p
   └─ 🪪 View your profile info
   └─ 🖼️ Reply with image to change DP

━━━ ◈ 🕹️ 𝗡𝗔𝗩𝗜𝗚𝗔𝗧𝗜𝗢𝗡 ◈ ━━━━
    (reply to bot's menu OR react)

❤️  React                    ➤ 📄 Next page
0️⃣  Reply: 0                ➤ ⬅️ Previous page
🔢  Reply: <n>              ➤ 👤 View profile + picture
➕  Reply: <n>a             ➤ 📤 Add / Send friend request
❌  Reply: <n>d             ➤ 🗑️ Delete / Reject
🚫  Reply: <n>b             ➤ ⛔ Block
💔  Reply: <n>uf            ➤ ➖ Unfriend (list)
⚫  Reply: <n>bl            ➤ 🚫 Block (list)
💬  Reply: <n>msg [text]    ➤ ✉️ Open / Send message
📦  Reply: bulk a/d/b/uf/bl ➤ ⚡ Bulk actions
🔍  Reply: s <name>         ➤ 🔎 Search (list only)
🔃  Reply: sort az / sort new ➤ 🧹 Sort (list)

━━━━━━━━━━━━━━━━━━━━━━
    ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝗥𝗜𝗬𝗔𝗗 ⚡
━━━━━━━━━━━━━━━━━━━━━━`
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

// Binary image downloader — uses bot cookies (no 429 from Facebook CDN)
function downloadImageBuffer(url, cookieStr, depth = 0) {
  if (depth > 4) return Promise.reject(new Error("Too many redirects"));
  const https = require("https");
  const http = require("http");
  const urlObj = new URL(url);
  const mod = urlObj.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "Cookie": cookieStr || "",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.facebook.com/"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
        return downloadImageBuffer(next, cookieStr, depth + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from image URL`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 500) return reject(new Error("Downloaded file too small — may not be a valid image"));
        resolve(buf);
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Download timeout")); });
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

// ─────────────────────────────────────────────
//  fetchInbox
//  - Uses ["INBOX"] tag explicitly (empty [] caused hangs)
//  - Promise.race with 20s timeout so it never freezes forever
// ─────────────────────────────────────────────
async function fetchInbox(api) {
  try {
    if (typeof api.getThreadList !== "function")
      return { data: [], error: "getThreadList is not available on this API." };

    let threads;
    try {
      threads = await Promise.race([
        api.getThreadList(30, null, ["INBOX"]),
        new Promise((_, rej) =>
          setTimeout(() =>
            rej(new Error("Timeout — Facebook did not respond. Try again or check your connection.")),
          20000)
        )
      ]);
    } catch (e) {
      return { data: [], error: e.message || String(e) };
    }

    threads = Array.isArray(threads) ? threads : [];
    return {
      data: threads.map(t => ({
        threadID: t.threadID,
        name: t.name || t.threadID,
        isGroup: t.isGroup || false,
        snippet: t.snippet || ""
      })),
      error: null
    };
  } catch (e) {
    return { data: [], error: e.message || String(e) };
  }
}

// ─────────────────────────────────────────────
//  fetchMessageRequests
// ─────────────────────────────────────────────
async function fetchMessageRequests(api) {
  try {
    if (typeof api.getThreadList !== "function")
      return { data: [], error: "getThreadList not available." };

    async function getFolder(folder, limit) {
      try {
        return await Promise.race([
          api.getThreadList(limit, null, [folder]),
          new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 20000))
        ]);
      } catch (_) { return []; }
    }

    const [other, pending, spam] = await Promise.all([
      getFolder("OTHER", 50),
      getFolder("PENDING", 50),
      getFolder("SPAM", 20)
    ]);

    const all = [
      ...buildMRList(Array.isArray(other) ? other : [], "you_may_know"),
      ...buildMRList(Array.isArray(pending) ? pending : [], "pending"),
      ...buildMRList(Array.isArray(spam) ? spam : [], "spam")
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
//  fetchOwnProfile
// ─────────────────────────────────────────────
async function fetchOwnProfile(api, rawApi) {
  try {
    if (typeof rawApi.getCurrentUserID === "function") {
      const uid = rawApi.getCurrentUserID();
      if (uid) {
        if (typeof rawApi.getUserInfo === "function") {
          const info = await Promise.race([
            new Promise((res, rej) => rawApi.getUserInfo(uid, (e, d) => e ? rej(e) : res(d))),
            new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 10000))
          ]);
          const userInfo = info && info[uid];
          if (userInfo) {
            return {
              uid,
              name: userInfo.name || userInfo.fullName || uid,
              vanity: userInfo.vanity || null,
              profileUrl: userInfo.vanity
                ? `https://www.facebook.com/${userInfo.vanity}`
                : `https://www.facebook.com/profile.php?id=${uid}`
            };
          }
        }
        return { uid, name: uid, vanity: null, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` };
      }
    }
  } catch (_) {}

  const cookieStr = buildCookieString(rawApi);
  if (cookieStr) {
    try {
      const res = await httpsGet("https://mbasic.facebook.com/profile.php", cookieStr);
      const html = res.body || "";
      const uidMatch = html.match(/["'](?:userID|uid)["']\s*:\s*["']?(\d+)["']?/i)
        || html.match(/profile\.php\?id=(\d+)/);
      const nameMatch = html.match(/<title>([^<]{2,60})<\/title>/i);
      const uid = uidMatch ? uidMatch[1] : null;
      const name = nameMatch ? nameMatch[1].replace(/ \| Facebook$/i, "").trim() : (uid || "Unknown");
      if (uid) return { uid, name, vanity: null, profileUrl: `https://www.facebook.com/profile.php?id=${uid}` };
    } catch (_) {}
  }

  return null;
}

// ─────────────────────────────────────────────
//  changeProfilePicture
// ─────────────────────────────────────────────
async function changeProfilePicture(rawApi, imageUrl) {
  if (typeof rawApi.changeAvatar !== "function") {
    throw new Error(
      "changeAvatar is not supported in this fca-riyad version.\n" +
      "Please update fca-riyad or change your profile picture manually."
    );
  }

  const cacheDir = path.join(__dirname, "cache");
  await fs.ensureDir(cacheDir);
  const filePath = path.join(cacheDir, `dp_${Date.now()}.jpg`);

  let imgBuffer;
  const cookieStr = buildCookieString(rawApi) || "";

  try {
    imgBuffer = await downloadImageBuffer(imageUrl, cookieStr);
  } catch (e1) {
    try {
      imgBuffer = await downloadImageBuffer(imageUrl, "");
    } catch (e2) {
      throw new Error(
        `Could not download the image.\n` +
        `Try 1 (with cookies): ${e1.message}\n` +
        `Try 2 (without cookies): ${e2.message}`
      );
    }
  }

  await fs.writeFile(filePath, imgBuffer);

  try {
    await new Promise((resolve, reject) => {
      rawApi.changeAvatar(fs.createReadStream(filePath), (err) => {
        fs.remove(filePath).catch(() => {});
        if (err) return reject(err);
        resolve();
      });
    });
    return { success: true };
  } catch (e) {
    fs.remove(filePath).catch(() => {});
    throw e;
  }
}

// ─────────────────────────────────────────────
//  FRIEND REQUEST ACCEPT / REJECT (mbasic scrape)
// ─────────────────────────────────────────────
async function findFriendRequestLinks(rawApi, uid) {
  const cookieStr = buildCookieString(rawApi);
  if (!cookieStr) throw new Error("Cookie unavailable");
  const res = await httpsGet("https://mbasic.facebook.com/friends/requests/", cookieStr);
  const html = res.body || "";

  const parts = html.split(/(<a href="[^"]*confirm[^"]*">)/i);
  for (let i = 1; i < parts.length - 1; i += 2) {
    const beforeText = parts[i - 1];
    const confirmTag = parts[i];
    const afterText = parts[i + 1] || "";

    const confirmHrefMatch = confirmTag.match(/href="([^"]+)"/i);
    if (!confirmHrefMatch) continue;

    const linkRe = /href="\/(?:profile\.php\?id=)?([^"?&\/\n]{1,60})[^"]*"/gi;
    let m, lastUid = null;
    while ((m = linkRe.exec(beforeText)) !== null) {
      const cand = m[1].replace(/^profile\.php\?id=/, "").split("?")[0].trim();
      if (cand && !cand.includes("/") && !["friends", "home", "settings", "requests"].includes(cand)) {
        lastUid = cand;
      }
    }
    if (lastUid !== String(uid)) continue;

    const confirmHrefRaw = confirmHrefMatch[1];
    const deleteMatch = afterText.match(/href="([^"]*(?:delete|reject)[^"]*)"/i);

    return {
      confirmUrl: confirmHrefRaw.startsWith("http") ? confirmHrefRaw : `https://mbasic.facebook.com${confirmHrefRaw}`,
      deleteUrl: deleteMatch
        ? (deleteMatch[1].startsWith("http") ? deleteMatch[1] : `https://mbasic.facebook.com${deleteMatch[1]}`)
        : null
    };
  }
  return null;
}

async function callFriendAction(rawApi, uid, accept) {
  const links = await findFriendRequestLinks(rawApi, uid);
  if (!links) {
    throw new Error("Request not found (it may already be accepted/removed, or the uid doesn't match a pending request).");
  }
  const targetUrl = accept ? links.confirmUrl : links.deleteUrl;
  if (!targetUrl) throw new Error(accept ? "Confirm link not found on requests page." : "Delete link not found on requests page.");

  const cookieStr = buildCookieString(rawApi);
  const res = await httpsGet(targetUrl, cookieStr);
  if (res.status < 200 || res.status >= 400) throw new Error(`HTTP ${res.status}`);
}

// ─────────────────────────────────────────────
//  MESSAGE REQUEST ACCEPT
// ─────────────────────────────────────────────
function callMessageRequestAction(rawApi, threadID, accept) {
  return new Promise((resolve, reject) => {
    if (typeof rawApi.handleMessageRequest !== "function") {
      return reject(new Error("handleMessageRequest is not available on this fca-riyad version."));
    }
    rawApi.handleMessageRequest(threadID, accept, (err) => err ? reject(err) : resolve());
  });
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

  const numOnly = input.match(/^(\d+)$/);
  if (numOnly) {
    const num = parseInt(numOnly[1]);
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    api.sendMessage(`⏳ Loading profile...`, threadID);
    await sendProfileCard(api, target.userID, target.fullName, target.vanity, threadID);
    return true;
  }

  const msgMatch = input.match(/^(\d+)msg(?:\s+(.+))?$/i);
  if (msgMatch) {
    const num = parseInt(msgMatch[1]);
    const msgText = (msgMatch[2] || "").trim();
    const target = items[num - 1];
    if (!target) { api.sendMessage(`❌ No friend #${num}.`, threadID); return true; }
    if (msgText) {
      try {
        await safeSendDM(api, msgText, target.userID);
        setLastDmThread(session.authorID, target.userID, target.fullName);
        api.sendMessage(`✅ Message sent to ${target.fullName}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send: ${e.message || String(e)}`, threadID); }
    } else {
      api.sendMessage(`💬 ${B(target.fullName)}\n🆔 UID: ${target.userID}\n📤 Reply: <n>msg <text> to send`, threadID);
    }
    return true;
  }

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
        if (action === "a")
          await callMessageRequestAction(rawApi, r.threadID, true);
        else if (action === "d" && typeof rawApi.deleteThread === "function")
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
      await callMessageRequestAction(rawApi, target.threadID, true);
      session.data = items.filter(r => r.threadID !== target.threadID);
      api.sendMessage(`✅ Accepted: ${target.name}\nYou can now message them.`, threadID);
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
  if (session.type === "inbox") text = buildInboxMenu(session.data, newPage);
  if (session.type === "mr")    text = buildMRMenu(session.data, newPage);
  if (text) {
    await sendPage(api, session.threadID, text, session, replyManager, reactionManager);
    sessionResetTimer(session.authorID);
  }
  return true;
}

// ─────────────────────────────────────────────
//  SHARED SESSION INPUT HANDLER
// ─────────────────────────────────────────────
async function handleSessionInput(api, rawApi, session, input, senderID, threadID, replyManager, reactionManager, event) {
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
          await safeSendDM(api, msgText, t.threadID);
          setLastDmThread(senderID, t.threadID, t.name);
          api.sendMessage(`✅ Sent to ${t.name}`, threadID);
        } catch (e) { api.sendMessage(`❌ Failed: ${e.message}`, threadID); }
      } else {
        api.sendMessage(`💬 ${B(t.name)}\n🆔 ${t.threadID}`, threadID);
      }
      return true;
    }
  }

  if (session.type === "profile") {
    const evAttachments = (event && event.attachments) || [];
    const imgAtt = evAttachments.find(a =>
      a && (a.type === "photo" || a.type === "image" || a.type === "sticker" ||
            (a.url && /\.(jpg|jpeg|png|gif|webp)/i.test(a.url)))
    );

    const urlMatch = input.match(/https?:\/\/\S+/i);

    const imageUrl = (imgAtt && (imgAtt.url || imgAtt.largePreviewUrl || imgAtt.previewUrl))
                   || (urlMatch && urlMatch[0]);

    if (imageUrl) {
      api.sendMessage("⏳ Downloading image and changing profile picture...", threadID);
      try {
        await changeProfilePicture(rawApi, imageUrl);
        api.sendMessage("✅ Profile picture changed successfully!", threadID);
        sessionClear(senderID);
      } catch (e) {
        api.sendMessage(`❌ Failed to change profile picture:\n${e.message || String(e)}`, threadID);
      }
      return true;
    }

    api.sendMessage(
      `📸 ${B("To change profile picture:")}\n` +
      `   • ${B("Attach/send an image")} in your reply, OR\n` +
      `   • Reply with a direct image URL\n` +
      `   Example: https://i.imgur.com/xxxxx.jpg`,
      threadID
    );
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────
//  SMS ALL BROADCAST  ★★★ FIXED IN 3.5.1 ★★★
//
//  - Uses the fixed safeSendDM() (raw fca-riyad callback, real errors).
//  - Delay bumped 300ms → 1200ms + random jitter (0-500ms) between sends.
//    Facebook's spam/abuse detection is very sensitive to fast, uniform-
//    interval outbound DMs — this was very likely why messages showed as
//    "sent" locally but never reached most recipients.
//  - Reports genuinely-sent vs genuinely-failed, and lists WHO failed and
//    WHY, instead of a single opaque count.
// ─────────────────────────────────────────────
async function runSmsAll(api, rawApi, threadID, text, authorID) {
  const result = await fetchFriendsList(rawApi);
  if (result.error || result.data.length === 0)
    return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);

  const friends = result.data;
  const state = { cancelled: false };
  sessionCreate(authorID, "sms_all", [], threadID, { smsAll: state });

  const statusInfo = await (async () => {
    try { return await api.sendMessage(`📢 Sending to ${friends.length} friends...\n0/${friends.length} done`, threadID); }
    catch (_) { return null; }
  })();
  const statusMsgID = statusInfo ? statusInfo.messageID : null;

  let sent = 0;
  const failedList = [];

  for (const friend of friends) {
    if (state.cancelled) break;
    try {
      await safeSendDM(api, text, friend.userID);
      sent++;
    } catch (e) {
      failedList.push(`${friend.fullName} (${friend.userID}): ${e && e.message ? e.message : String(e)}`);
    }

    if ((sent + failedList.length) % 10 === 0) {
      try { api.sendMessage(`📢 Sending...\n${sent + failedList.length}/${friends.length} processed (${sent} confirmed sent)`, threadID); } catch (_) {}
    }

    // Slower + jittered delay — reduces the chance Facebook's spam filter
    // silently drops messages after accepting the API call.
    await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 500)));
  }

  let finalText = state.cancelled
    ? `📴 Broadcast cancelled.\n✅ Confirmed sent: ${sent}/${friends.length}`
    : `✅ Broadcast complete!\n📤 Confirmed sent: ${sent}/${friends.length} friends`;

  if (failedList.length > 0) {
    finalText += `\n⚠️ Failed: ${failedList.length}\n\n` +
      failedList.slice(0, 15).map(f => `• ${f}`).join("\n") +
      (failedList.length > 15 ? `\n...and ${failedList.length - 15} more (see server logs).` : "");
  }

  api.sendMessage(finalText, threadID);
  if (statusMsgID) try { rawApi.unsendMessage(statusMsgID, () => {}); } catch (_) {}
  sessionClear(authorID);
}

// ─────────────────────────────────────────────
//  MODULE EXPORT
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fb", "fbc", "fbm"],
    version: "3.5.1",
    author: "Riyad Bot Team",
    countDown: 3,
    role: 2,
    shortDescription: "Facebook Account Manager",
    longDescription: "Manage friend requests, friends list, inbox, message requests, and your own profile.",
    category: "account",
    guide: { en: "fb | fb list | fb inbox | fb mr | fb sms <n|uid> <text> | fb sms reply <text> | fb sms all <text> | fb p" }
  },

  onReaction: async function({ api, event, Reaction, reactionData, replyManager, reactionManager }) {
    try {
      const { userID, messageID } = event;
      const ownerID = (Reaction && Reaction.authorID)
                    || (reactionData && reactionData.authorID);
      if (!ownerID) return;

      const session = sessionGet(ownerID);
      if (!session) return;
      if (session.lastMsgID !== messageID) return;

      if (String(userID) !== String(ownerID)) {
        try { api.sendMessage("⚠️ এই মেনুটি আপনার জন্য নয়!", session.threadID); } catch (_) {}
        return;
      }

      if (["req", "list", "inbox", "mr"].includes(session.type))
        await navigatePage(api, session, 1, replyManager, reactionManager);
    } catch (err) { console.error("[fbcontrol] onReaction error:", err); }
  },

  onReply: async function({ api, event, Reply, replyData, replyManager, reactionManager }) {
    try {
      const { senderID, threadID, body } = event;
      const rawApi = getRawApi(api);
      const authorID = (Reply && Reply.authorID)
                    || (replyData && replyData.authorID)
                    || senderID;
      const session = sessionGet(authorID);
      if (!session) return;
      const input = (body || "").trim().toLowerCase();
      await handleSessionInput(api, rawApi, session, input, authorID, threadID, replyManager, reactionManager, event);
    } catch (err) { console.error("[fbcontrol] onReply error:", err); }
  },

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

  // ── SMS COMMANDS ──────────────────────────────────────────────────────────
  if (sub === "sms") {
    const target = args[1];
    const smsUsage = "❌ Usage:\n  fb sms <number|uid> <text>\n  fb sms reply <text>\n  fb sms all <text>";
    if (!target) return api.sendMessage(smsUsage, threadID);

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
    if (target.toLowerCase() === "reply") {
      const msg = args.slice(2).join(" ");
      if (!msg) return api.sendMessage("❌ Usage: fb sms reply <text>", threadID);
      const last = getLastDmThread(senderID);
      if (!last) return api.sendMessage("❌ No previous DM thread found yet. Send one with `fb sms <n|uid> <text>` first.", threadID);
      try {
        await safeSendDM(api, msg, last.threadID);
        setLastDmThread(senderID, last.threadID, last.name);
        api.sendMessage(`✅ Replied to ${last.name}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send: ${e.message || String(e)}`, threadID); }
      return;
    }

    const msg = args.slice(2).join(" ");
    if (!msg) return api.sendMessage(smsUsage, threadID);

    const n = parseInt(target);
    if (isNaN(n)) return api.sendMessage(smsUsage, threadID);

    if (String(n).length <= 5) {
      const result = await fetchFriendsList(rawApi);
      if (result.error || !result.data.length)
        return api.sendMessage(`❌ Could not load friends: ${result.error || "Empty"}`, threadID);
      const friend = result.data[n - 1];
      if (!friend) return api.sendMessage(`❌ No friend #${n}.`, threadID);
      try {
        await safeSendDM(api, msg, friend.userID);
        setLastDmThread(senderID, friend.userID, friend.fullName);
        api.sendMessage(`✅ Message sent to ${friend.fullName}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send to ${friend.fullName}: ${e.message}`, threadID); }
    } else {
      try {
        await safeSendDM(api, msg, String(n));
        setLastDmThread(senderID, String(n));
        api.sendMessage(`✅ Message sent to UID ${n}`, threadID);
      } catch (e) { api.sendMessage(`❌ Failed to send to UID ${n}: ${e.message}`, threadID); }
    }
    return;
  }

  // ── PROFILE COMMAND (fb p) ────────────────────────────────────────────────
  if (sub === "p") {
    api.sendMessage("⏳ Loading your profile...", threadID);
    try {
      const profile = await fetchOwnProfile(api, rawApi);
      if (!profile) return api.sendMessage("❌ Could not load profile info.", threadID);

      await sendProfileCard(api, profile.uid, profile.name, profile.vanity, threadID);

      sessionCreate(senderID, "profile", [profile], threadID);
      const sess = sessionGet(senderID);

      const profileText =
        `${D}\n👤 ${B("YOUR PROFILE")}\n${D}\n` +
        `🆔 UID: ${profile.uid}\n` +
        `📛 Name: ${profile.name}\n` +
        `🔗 ${profile.profileUrl}\n\n` +
        `📸 ${B("To change profile picture:")}\n` +
        `   • ${B("Attach/send a photo")} as a reply, OR\n` +
        `   • Reply with a direct image URL\n` +
        `${D}`;

      const info = await api.sendMessage(profileText, threadID);
      if (info && info.messageID && sess) {
        sess.lastMsgID = info.messageID;
        const payload = { commandName: "fbcontrol", authorID: String(senderID), sessionType: "profile" };
        try { replyManager.set(info.messageID, payload); } catch (_) {}
      }
    } catch (e) {
      api.sendMessage(`❌ Error: ${e.message || String(e)}`, threadID);
    }
    return;
  }

  // ── SESSION NAVIGATION ──────────────────────────────────────────────────
  if (session) {
    const rawInput = (body || "").trim().replace(/^(?:fbcontrol|fbc|fbm|fb)\s*/i, "").trim().toLowerCase();
    await handleSessionInput(api, rawApi, session, rawInput, senderID, threadID, replyManager, reactionManager, event);
    return;
  }

  // ── FRESH COMMANDS ────────────────────────────────────────────────────────
  if (!sub || sub === "help") return api.sendMessage(buildHelpMenu(), threadID);

  if (sub === "list") {
    api.sendMessage("⏳ Loading friends list...", threadID);
    const result = await fetchFriendsList(rawApi);
    if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
    sessionCreate(senderID, "list", result.data, threadID);
    await sendPage(api, threadID, buildListMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
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

  api.sendMessage("⏳ Loading friend requests...", threadID);
  const result = await fetchFriendRequests(rawApi);
  if (result.error && result.data.length === 0) return api.sendMessage(`❌ ${result.error}`, threadID);
  sessionCreate(senderID, "req", result.data, threadID);
  await sendPage(api, threadID, buildReqMenu(result.data, 0), sessionGet(senderID), replyManager, reactionManager);
}
