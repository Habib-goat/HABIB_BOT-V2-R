const axios = require("axios");

// প্রতিটা ইউজারের ইমেইল সেশন মনে রাখার জন্য
const sessions = new Map(); // key: senderID -> { login, domain, interval, seenIDs }

const BASE = "https://www.1secmail.com/api/v1/";
const DOMAINS = ["1secmail.com", "1secmail.org", "1secmail.net"];

// কিছু ফ্রি API হেডার ছাড়া রিকোয়েস্ট ব্লক করে (403) — তাই ব্রাউজারের মতো হেডার পাঠানো হচ্ছে
const client = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json"
  }
});

function randomLogin() {
  return "riyad" + Math.random().toString(36).substring(2, 10);
}

async function getMessages(login, domain) {
  const res = await client.get(BASE, {
    params: { action: "getMessages", login, domain }
  });
  return res.data || [];
}

async function getMessageBody(login, domain, id) {
  const res = await client.get(BASE, {
    params: { action: "readMessage", login, domain, id }
  });
  return res.data;
}

function extractCode(text) {
  if (!text) return null;
  const match = text.match(/\b\d{4,8}\b/);
  return match ? match[0] : null;
}

function extractLink(html, text) {
  const source = html || text || "";
  // http/https দিয়ে শুরু হওয়া প্রথম লিংক খোঁজা হচ্ছে
  const match = source.match(/https?:\/\/[^\s"'<>)]+/);
  return match ? match[0] : null;
}

function formatMail(full) {
  let body = `📩 | New mail received!\nFrom: ${full.from || "unknown"}\n`;
  body += `Subject: ${full.subject || "(no subject)"}\n\n`;
  const text = full.textBody || full.body || "";
  const html = full.htmlBody || "";
  body += `${text.slice(0, 400)}\n`;

  const code = extractCode(text || full.subject);
  const link = extractLink(html, text);

  if (code) body += `\n🔑 | Detected code: ${code}`;
  if (link) body += `\n🔗 | Verification link: ${link}`;
  return body;
}

module.exports = {
  config: {
    name: "tempmail",
    version: "2.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "utility",
    shortDescription: "Create a temporary email & auto-receive codes",
    longDescription: "Generate a disposable email (1secmail), check inbox, and auto-notify when a code arrives",
    guide: "{pn} → নতুন টেম্প ইমেইল বানায়\n{pn} check → ইনবক্স চেক করে\n{pn} stop → অটো-চেক বন্ধ করে"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const sub = (args[0] || "").toLowerCase();

    // ===== STOP =====
    if (sub === "stop") {
      const session = sessions.get(senderID);
      if (session?.interval) clearInterval(session.interval);
      sessions.delete(senderID);
      return api.sendMessage("🛑 | Temp mail session ended.", threadID, messageID);
    }

    // ===== CHECK (manual) =====
    if (sub === "check") {
      const session = sessions.get(senderID);
      if (!session) {
        return api.sendMessage(
          "❌ | You don't have an active temp mail. Type `tempmail` first to create one.",
          threadID,
          messageID
        );
      }
      try {
        const messages = await getMessages(session.login, session.domain);
        if (!messages.length) {
          return api.sendMessage("📭 | Inbox is empty right now.", threadID, messageID);
        }
        const latest = messages[0];
        const full = await getMessageBody(session.login, session.domain, latest.id);
        return api.sendMessage(formatMail(full), threadID, messageID);
      } catch (err) {
        console.error("tempmail check error:", err?.response?.data || err.message);
        const status = err?.response?.status;
        const detail = status ? `HTTP ${status}` : err.message;
        return api.sendMessage(`❌ | Failed to check inbox.\nReason: ${detail}`, threadID, messageID);
      }
    }

    // ===== CREATE NEW =====
    try {
      const old = sessions.get(senderID);
      if (old?.interval) clearInterval(old.interval);

      const login = randomLogin();
      const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
      const email = `${login}@${domain}`;
      const seenIDs = new Set();

      // ইমেইলটা আলাদা মেসেজে পাঠানো হচ্ছে যাতে সহজে কপি করা যায়
      await api.sendMessage(email, threadID, messageID);
      await api.sendMessage(
        `👆 | Your temp email (tap & hold to copy)\n\n` +
          `👉 এই ইমেইলে যেকোনো সাইটে সাইন-আপ করুন। কোড আসলে আমি অটোমেটিক পাঠিয়ে দেব।\n` +
          `Manual check: tempmail check\nStop: tempmail stop`,
        threadID
      );

      const interval = setInterval(async () => {
        try {
          const messages = await getMessages(login, domain);
          for (const m of messages) {
            if (seenIDs.has(m.id)) continue;
            seenIDs.add(m.id);
            const full = await getMessageBody(login, domain, m.id);
            api.sendMessage(formatMail(full), threadID);
          }
        } catch (err) {
          console.error("tempmail poll error:", err?.response?.data || err.message);
        }
      }, 10000);

      sessions.set(senderID, { login, domain, interval, seenIDs });

      setTimeout(() => {
        const s = sessions.get(senderID);
        if (s?.interval) {
          clearInterval(s.interval);
          sessions.delete(senderID);
          api.sendMessage("⏰ | Temp mail session expired (30 min).", threadID);
        }
      }, 30 * 60 * 1000);
    } catch (err) {
      console.error("tempmail create error:", err?.response?.data || err.message);
      return api.sendMessage(
        `❌ | Failed to create temp email.\nReason: ${err.message}`,
        threadID,
        messageID
      );
    }
  }
};
