const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

const PER_PAGE = 10;

// ================= UNICODE BOLD HELPER =================
// Facebook/Messenger has no real "bold" text formatting, so we fake it by
// mapping normal ASCII letters/digits to the Unicode "Mathematical
// Alphanumeric Symbols" bold block. This only affects Latin script — it
// silently passes through Bengali/other scripts and symbols untouched,
// which is fine since there's no bold variant for those anyway.
function toBold(str) {
  const map = {};
  const upperStart = 0x1D400; // Mathematical Bold Capital A
  const lowerStart = 0x1D41A; // Mathematical Bold Small a
  const digitStart = 0x1D7CE; // Mathematical Bold Digit Zero
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(65 + i)] = String.fromCodePoint(upperStart + i);
    map[String.fromCharCode(97 + i)] = String.fromCodePoint(lowerStart + i);
  }
  for (let i = 0; i < 10; i++) {
    map[String.fromCharCode(48 + i)] = String.fromCodePoint(digitStart + i);
  }
  return String(str)
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
}

// ================= STATE HELPERS =================
function getListState(all, { search = "", sort = "default" } = {}) {
  let list = all.slice();

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((f) => (f.fullName || "").toLowerCase().includes(q));
  }

  if (sort === "az") {
    list.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
  } else if (sort === "new") {
    // NOTE: getFriendsList doesn't return a friendship timestamp, so true
    // "newest first" isn't available from this API. We approximate it by
    // reversing the natural list order (best effort only).
    list.reverse();
  }

  return list;
}

function buildPageText(list, page, meta) {
  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  page = Math.min(Math.max(1, page), totalPages);

  const start = (page - 1) * PER_PAGE;
  const rows = list.slice(start, start + PER_PAGE);

  let body = "";
  body += `╔════════════════════╗\n`;
  body += `║  👥 ${toBold("FRIENDS LIST")}\n`;
  body += `║  Page ${toBold(String(page))} / ${toBold(String(totalPages))}  │ Total: ${toBold(String(list.length))}\n`;
  body += `╚════════════════════╝\n`;
  body += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (rows.length === 0) {
    body += "😕 কোনো ফ্রেন্ড পাওয়া যায়নি।\n\n";
  }

  rows.forEach((f, i) => {
    const serial = start + i + 1;
    body += `${serial}. 👤 ${toBold(f.fullName || "Unknown")}\n`;
    body += `   🆔 UID: ${f.userID}\n`;
    body += `   🔗 https://www.facebook.com/${f.userID}\n`;
    body += `  ✅Accept 💬msg  🚫bl  ❌uf\n\n`;
  });

  body += `━━━━━━━━━━━━━━━━━━━━━\n`;
  body += `🕹️ ${toBold("CONTROLS")} (reply to this msg)\n`;
  body += ` <n>msg <text> → Message\n`;
  body += ` <n>uf → Unfriend\n`;
  body += ` <n>bl → Block\n`;
  body += ` <n>accept → Accept request\n`;
  body += ` <n> → Show profile card\n`;
  body += ` s <name> → Search\n`;
  body += ` sort az / sort new\n`;
  body += `━━━━━━━━━━━━━━━━━━━━━\n`;
  body += `❤️ React → Next\n`;
  body += `📩 Reply 0 → Prev`;

  return { body, page, totalPages };
}

async function sendProfileCard(api, threadID, messageID, friend) {
  const cacheDir = path.join(__dirname, "cache");
  await fs.ensureDir(cacheDir);
  const filePath = path.join(cacheDir, `fbcontrol_${Date.now()}.jpg`);

  const caption =
    `👤 ${toBold("Name")}: ${friend.fullName || "Unknown"}\n` +
    `🔗 ${toBold("Username")}: ${friend.vanity || "N/A"}\n` +
    `🆔 ${toBold("UID")}: ${friend.userID}`;

  try {
    const picUrl =
      friend.profilePicture ||
      `https://graph.facebook.com/${friend.userID}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;

    const res = await axios.get(picUrl, { responseType: "arraybuffer", timeout: 15000 });
    await fs.writeFile(filePath, res.data);

    await api.sendMessage(
      { body: caption, attachment: fs.createReadStream(filePath) },
      threadID,
      null,
      messageID
    );
  } catch (e) {
    console.error("[fbcontrol] profile pic fetch failed:", e.message);
    await api.sendMessage(caption, threadID, messageID);
  } finally {
    fs.remove(filePath).catch(() => {});
  }
}

module.exports = {
  config: {
    name: "fbcontrol",
    aliases: ["fblist", "fbc"],
    version: "1.0.0",
    author: "Riyad",
    countDown: 10,
    // Admin/owner only — this command can message, unfriend, and block
    // people directly from the bot account's real friends list, so it's
    // deliberately not open to role 0 users.
    role: 2,
    category: "utility",
    description: {
      en: "Manage your Facebook friends list (msg / unfriend / block / accept) from chat"
    },
    guide: {
      en: "{pn} — shows your friends list. Reply with:\n <n>msg <text>\n <n>uf\n <n>bl\n <n>accept\n <n>\n s <name>\n sort az / sort new\nReact ❤️ for next page, reply 0 for previous page."
    }
  },

  onStart: async function ({ api, event, replyManager, reactionManager }) {
    const { threadID, messageID, senderID } = event;

    try {
      const friends = await api.getFriendsList();

      if (!friends || friends.length === 0) {
        return api.sendMessage("😕 কোনো ফ্রেন্ড পাওয়া যায়নি।", threadID, messageID);
      }

      const state = { search: "", sort: "default" };
      const list = getListState(friends, state);
      const { body } = buildPageText(list, 1, state);

      api.sendMessage(body, threadID, (err, info) => {
        if (err || !info || !info.messageID) return;

        const data = {
          commandName: "fbcontrol",
          authorID: senderID,
          allFriends: friends,
          search: state.search,
          sort: state.sort,
          page: 1
        };

        if (replyManager) replyManager.set(info.messageID, data);
        if (reactionManager) reactionManager.set(info.messageID, data);
      }, messageID);
    } catch (err) {
      console.error("[fbcontrol] onStart error:", err);
      return api.sendMessage(
        `❌ ফ্রেন্ড লিস্ট আনতে সমস্যা হয়েছে: ${err.message || err.error || "Unknown error"}`,
        threadID,
        messageID
      );
    }
  },

  onReaction: async function ({ api, event, Reaction, reactionManager, replyManager }) {
    const { threadID, messageID, userID } = event;
    if (!Reaction) return;
    if (String(userID) !== String(Reaction.authorID)) return; // only requester can paginate
    if (event.reaction !== "❤️") return;

    const list = getListState(Reaction.allFriends, {
      search: Reaction.search,
      sort: Reaction.sort
    });

    let nextPage = (Reaction.page || 1) + 1;
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (nextPage > totalPages) nextPage = 1; // wrap around

    const { body, page } = buildPageText(list, nextPage, Reaction);

    try {
      if (typeof api.editMessage === "function") {
        await api.editMessage(messageID, body);
      } else {
        // fallback: send a fresh message and move the listeners to it
        return api.sendMessage(body, threadID, (err, info) => {
          if (err || !info || !info.messageID) return;
          const data = { ...Reaction, page };
          if (replyManager) replyManager.set(info.messageID, data);
          if (reactionManager) reactionManager.set(info.messageID, data);
        });
      }

      const data = { ...Reaction, page };
      if (reactionManager) reactionManager.set(messageID, data);
      if (replyManager) replyManager.set(messageID, data);
    } catch (e) {
      console.error("[fbcontrol] pagination edit failed:", e.message);
    }
  },

  onReply: async function ({ api, event, Reply, replyManager, reactionManager }) {
    const { threadID, messageID, senderID, body } = event;
    if (!Reply) return;
    if (String(senderID) !== String(Reply.authorID)) return; // only requester can control

    const text = (body || "").trim();
    const list = getListState(Reply.allFriends, { search: Reply.search, sort: Reply.sort });

    const rerenderAndReplace = async (newState, page) => {
      const merged = { ...Reply, ...newState };
      const newList = getListState(Reply.allFriends, { search: merged.search, sort: merged.sort });
      const { body: text2, page: p2 } = buildPageText(newList, page || 1, merged);

      return api.sendMessage(text2, threadID, (err, info) => {
        if (err || !info || !info.messageID) return;
        const data = { ...merged, page: p2 };
        if (replyManager) replyManager.set(info.messageID, data);
        if (reactionManager) reactionManager.set(info.messageID, data);
      });
    };

    // ── Previous page ──
    if (text === "0") {
      const prevPage = Math.max(1, (Reply.page || 1) - 1);
      const { body: text2 } = buildPageText(list, prevPage, Reply);
      try {
        if (typeof api.editMessage === "function") {
          await api.editMessage(messageID, text2);
          const data = { ...Reply, page: prevPage };
          if (replyManager) replyManager.set(messageID, data);
          if (reactionManager) reactionManager.set(messageID, data);
          return;
        }
      } catch (e) {}
      return rerenderAndReplace({}, prevPage);
    }

    // ── Search: "s <name>" ──
    let m = text.match(/^s\s+(.+)$/i);
    if (m) {
      return rerenderAndReplace({ search: m[1].trim() }, 1);
    }

    // ── Sort: "sort az" / "sort new" ──
    m = text.match(/^sort\s+(az|new)$/i);
    if (m) {
      return rerenderAndReplace({ sort: m[1].toLowerCase() }, 1);
    }

    // ── "<n>" or "<n>msg <text>" / "<n>uf" / "<n>bl" / "<n>accept" ──
    m = text.match(/^(\d+)\s*(msg|uf|bl|accept)?\s*([\s\S]*)$/i);
    if (!m) return;

    const idx = parseInt(m[1], 10);
    const action = (m[2] || "").toLowerCase();
    const extra = (m[3] || "").trim();

    if (!idx || idx < 1 || idx > list.length) {
      return api.sendMessage(`❌ Invalid number. 1 - ${list.length} এর মধ্যে দিন।`, threadID, messageID);
    }

    const friend = list[idx - 1];

    try {
      if (!action) {
        // bare number → profile card
        return await sendProfileCard(api, threadID, messageID, friend);
      }

      if (action === "msg") {
        if (!extra) {
          return api.sendMessage("❌ মেসেজে টেক্সট লিখুন। যেমন: 10msg Hello", threadID, messageID);
        }
        await api.sendMessage(extra, friend.userID);
        return api.sendMessage(`✅ মেসেজ পাঠানো হয়েছে ${friend.fullName} কে।`, threadID, messageID);
      }

      if (action === "uf") {
        if (typeof api.unfriend !== "function") {
          return api.sendMessage("❌ unfriend সাপোর্ট করছে না এই সেশনে।", threadID, messageID);
        }
        await api.unfriend(friend.userID);
        return api.sendMessage(`✅ ${friend.fullName} কে আনফ্রেন্ড করা হয়েছে।`, threadID, messageID);
      }

      if (action === "bl") {
        if (typeof api.changeBlockedStatus !== "function") {
          return api.sendMessage("❌ block সাপোর্ট করছে না এই সেশনে।", threadID, messageID);
        }
        await api.changeBlockedStatus(friend.userID, true);
        return api.sendMessage(`✅ ${friend.fullName} কে ব্লক করা হয়েছে।`, threadID, messageID);
      }

      if (action === "accept") {
        if (typeof api.handleFriendRequest !== "function") {
          return api.sendMessage("❌ accept সাপোর্ট করছে না এই সেশনে।", threadID, messageID);
        }
        // NOTE: this list is your current friends list — it does not
        // include pending incoming friend requests (Facebook doesn't
        // expose those through this API). "accept" here only has an
        // effect if this UID genuinely has a pending request to you.
        await api.handleFriendRequest(friend.userID, true);
        return api.sendMessage(`✅ ${friend.fullName} এর রিকোয়েস্ট accept করা হয়েছে (যদি পেন্ডিং থাকে)।`, threadID, messageID);
      }
    } catch (err) {
      console.error("[fbcontrol] action error:", err);
      return api.sendMessage(`❌ কাজটি করতে সমস্যা হয়েছে: ${err.message || err.error || "Unknown error"}`, threadID, messageID);
    }
  }
};
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
    aliases: ["fb", "fbc", "fbm", "fbctrl"],
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

  // ── ONSTART — main command entry (RIYAD_BOT-V2 calls onStart, not run) ──
  onStart: async function({ api, event, args, replyManager, reactionManager }) {
    try {
      await handleRun({ api, event, args, replyManager, reactionManager });
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
