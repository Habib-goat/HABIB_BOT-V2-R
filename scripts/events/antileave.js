module.exports = {
  config: {
    name: "antileave",
    version: "1.3.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);
    const authorID = String(event.author || "");

    // শুধুমাত্র নিজে Leave করলে কাজ করবে
    if (leftUserID !== authorID) return;

    // বট Leave করলে কিছু করবে না
    let botID = "";
    try {
      botID = typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : String(api.botID || "");
    } catch {
      botID = String(api.botID || "");
    }

    if (leftUserID === botID) return;

    console.log("[ANTILEAVE] Re-adding:", leftUserID);

    // Facebook-এর প্রসেস শেষ হওয়ার জন্য একটু অপেক্ষা
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      await api.addUserToGroup(leftUserID, threadID);

      console.log("✅ USER RE-ADDED");

      let userName = "Member";

      try {
        if (typeof api.getUserInfo === "function") {
          const info = await new Promise((resolve, reject) => {
            api.getUserInfo(leftUserID, (err, data) => {
              if (err) return reject(err);
              resolve(data);
            });
          });

          if (info && info[leftUserID]?.name) {
            userName = info[leftUserID].name;
          }
        }
      } catch (e) {
        console.log("getUserInfo failed:", e.message);
      }

      await api.sendMessage({
        body:
`╔════════════════════╗
║ 🛡️ ANTI LEAVE 🛡️
╠════════════════════╣

👋 ${userName}

✅ আপনাকে আবার গ্রুপে যুক্ত করা হয়েছে।

⚠️ গ্রুপ থেকে নিজে বের হওয়া অনুমোদিত নয়।

╚════════════════════╝`,
        mentions: [
          {
            id: leftUserID,
            tag: userName
          }
        ]
      }, threadID);

    } catch (err) {
      console.error("ADD ERROR:", err);

      await api.sendMessage(
        `❌ AntiLeave Failed\n\n${err.errorDescription || err.message || JSON.stringify(err)}`,
        threadID
      );
    }
  }
};
