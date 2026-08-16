const axios = require("axios");

// প্রতিটা ইউজারের সেশন মনে রাখার জন্য (GuerrillaMail sid_token ভিত্তিক)
const sessions = new Map(); // key: senderID -> { sidToken, email, interval, seenIDs }

const BASE = "https://api.guerrillamail.com/ajax.php";

const client = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json"
  }
});

async function getEmailAddress() {
  const res = await client.get(BASE, {
    params: { f: "get_email_address", ip: "127.0.0.1", agent: "Mozilla_foo_bar" }
  });
  return res.data; // { email_addr, sid_token, email_timestamp }
}

async function checkEmail(sidToken, seq = 0) {
  const res = await client.get(BASE, {
    params: { f: "check_email", seq, sid_token: sidToken }
  });
  return res.data; // { list: [...], count, sid_token }
}

async function fetchEmail(sidToken, emailId) {
  const res = await client.get(BASE, {
    params: { f: "fetch_email", email_id: emailId, sid_token: sidToken }
  });
  return res.data; // { mail_from, mail_subject, mail_body, mail_excerpt, ... }
}

function extractCode(text) {
  if (!text) return null;
  const match = text.match(/\b\d{4,8}\b/);
  return match ? match[0] : null;
}

function extractLink(html) {
  if (!html) return null;
  const match = html.match(/https?:\/\/[^\s"'<>)]+/);
  return match ? match[0] : null;
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatMail(full) {
  const plain = stripHtml(full.mail_body);
  let body = `📩 | New mail received!\nFrom: ${full.mail_from || "unknown"}\n`;
  body += `Subject: ${full.mail_subject || "(no subject)"}\n\n`;
  body += `${plain.slice(0, 400)}\n`;

  const code = extractCode(plain || full.mail_subject);
  const link = extractLink(full.mail_body);

  if (code) body += `\n🔑 | Detected code: ${code}`;
  if (link) body += `\n🔗 | Verification link: ${link}`;
  return body;
}

module.exports = {
  config: {
    name: "tempmail",
    version: "3.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "utility",
    shortDescription: "Create a temporary email & auto-receive codes",
    longDescription: "Generate a disposable email (GuerrillaMail), check inbox, and auto-notify when a code/link arrives",
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
        const result = await checkEmail(session.sidToken);
        const list = result.list || [];
        if (!list.length) {
          return api.sendMessage("📭 | Inbox is empty right now.", threadID, messageID);
        }
        const latest = list[0];
        const full = await fetchEmail(session.sidToken, latest.mail_id);
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

      const account = await getEmailAddress();
      const sidToken = account.sid_token;
      const email = account.email_addr;
      const seenIDs = new Set();

      // ইমেইলটা আলাদা মেসেজে পাঠানো হচ্ছে যাতে সহজে কপি করা যায়
      await api.sendMessage(email, threadID, messageID);
      await api.sendMessage(
        `👆 | Your temp email (tap & hold to copy)\n\n` +
          `👉 এই ইমেইলে যেকোনো সাইটে সাইন-আপ করুন। কোড/লিংক আসলে আমি অটোমেটিক পাঠিয়ে দেব।\n` +
          `Manual check: tempmail check\nStop: tempmail stop`,
        threadID
      );

      const interval = setInterval(async () => {
        try {
          const result = await checkEmail(sidToken);
          const list = result.list || [];
          for (const m of list) {
            if (seenIDs.has(m.mail_id)) continue;
            seenIDs.add(m.mail_id);
            // GuerrillaMail এর প্রথম ওয়েলকাম মেইল (mail_id: 1) স্কিপ করা হচ্ছে
            if (m.mail_id === "1" || m.mail_id === 1) continue;
            const full = await fetchEmail(sidToken, m.mail_id);
            api.sendMessage(formatMail(full), threadID);
          }
        } catch (err) {
          console.error("tempmail poll error:", err?.response?.data || err.message);
        }
      }, 10000);

      sessions.set(senderID, { sidToken, email, interval, seenIDs });

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
