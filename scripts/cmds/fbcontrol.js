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
