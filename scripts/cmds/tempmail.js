const axios = require("axios");

// প্রতিটা থ্রেড/ইউজারের অ্যাকাউন্ট ও পোলিং ইন্টারভাল মনে রাখার জন্য
const sessions = new Map(); // key: senderID -> { email, password, token, id, interval, seenIDs }

const BASE = "https://api.mail.tm";

async function createAccount() {
  const domRes = await axios.get(`${BASE}/domains`);
  const domain = domRes.data["hydra:member"][0].domain;

  const username = "riyad" + Math.random().toString(36).substring(2, 10);
  const password = Math.random().toString(36).substring(2, 12);
  const address = `${username}@${domain}`;

  await axios.post(`${BASE}/accounts`, { address, password });

  const tokenRes = await axios.post(`${BASE}/token`, { address, password });
  const token = tokenRes.data.token;

  return { email: address, password, token };
}

async function getMessages(token) {
  const res = await axios.get(`${BASE}/messages`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data["hydra:member"] || [];
}

async function getMessageBody(token, id) {
  const res = await axios.get(`${BASE}/messages/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

function extractCode(text) {
  if (!text) return null;
  // ৪-৮ ডিজিটের OTP/verification code খোঁজার সাধারণ প্যাটার্ন
  const match = text.match(/\b\d{4,8}\b/);
  return match ? match[0] : null;
}

module.exports = {
  config: {
    name: "tempmail",
    version: "1.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    category: "utility",
    shortDescription: "Create a temporary email & auto-receive codes",
    longDescription: "Generate a disposable email, check inbox, and auto-notify when a verification code arrives",
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
        const messages = await getMessages(session.token);
        if (!messages.length) {
          return api.sendMessage("📭 | Inbox is empty right now.", threadID, messageID);
        }
        const latest = messages[0];
        const full = await getMessageBody(session.token, latest.id);
        const code = extractCode(full.text || full.subject);
        let body = `📩 | New mail from: ${full.from?.address || "unknown"}\n`;
        body += `Subject: ${full.subject || "(no subject)"}\n\n`;
        body += `${(full.text || "").slice(0, 500)}\n`;
        if (code) body += `\n🔑 | Detected code: ${code}`;
        return api.sendMessage(body, threadID, messageID);
      } catch (err) {
        console.error("tempmail check error:", err);
        return api.sendMessage("❌ | Failed to check inbox.", threadID, messageID);
      }
    }

    // ===== CREATE NEW =====
    try {
      // আগের সেশন থাকলে বন্ধ করে দেওয়া
      const old = sessions.get(senderID);
      if (old?.interval) clearInterval(old.interval);

      const account = await createAccount();
      const seenIDs = new Set();

      await api.sendMessage(
        `📧 | Your temp email:\n${account.email}\n\n` +
          `👉 এই ইমেইলে যেকোনো সাইটে সাইন-আপ করুন। কোড আসলে আমি অটোমেটিক পাঠিয়ে দেব।\n` +
          `Manual check: tempmail check\nStop: tempmail stop`,
        threadID,
        messageID
      );

      // প্রতি ১০ সেকেন্ডে ইনবক্স পোল করে নতুন মেইল আসলেই পাঠানো হবে
      const interval = setInterval(async () => {
        try {
          const messages = await getMessages(account.token);
          for (const m of messages) {
            if (seenIDs.has(m.id)) continue;
            seenIDs.add(m.id);

            const full = await getMessageBody(account.token, m.id);
            const code = extractCode(full.text || full.subject);

            let body = `📩 | New mail received!\nFrom: ${full.from?.address || "unknown"}\n`;
            body += `Subject: ${full.subject || "(no subject)"}\n\n`;
            body += `${(full.text || "").slice(0, 500)}\n`;
            if (code) body += `\n🔑 | Detected code: ${code}`;

            api.sendMessage(body, threadID);
          }
        } catch (err) {
          console.error("tempmail poll error:", err);
        }
      }, 10000);

      sessions.set(senderID, { ...account, interval, seenIDs });

      // ৩০ মিনিট পর অটো বন্ধ (সার্ভার রিসোর্স বাঁচাতে)
      setTimeout(() => {
        const s = sessions.get(senderID);
        if (s?.interval) {
          clearInterval(s.interval);
          sessions.delete(senderID);
          api.sendMessage("⏰ | Temp mail session expired (30 min).", threadID);
        }
      }, 30 * 60 * 1000);
    } catch (err) {
      console.error("tempmail create error:", err);
      return api.sendMessage(
        "❌ | Failed to create temp email. The service may be down, try again later.",
        threadID,
        messageID
      );
    }
  }
};
