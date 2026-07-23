module.exports = {
  config: {
    name: "antileave",
    version: "1.2.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);
    const authorID = String(event.author || "");

    // শুধু নিজে Leave করলে কাজ করবে
    if (leftUserID !== authorID) return;

    let botID = "";
    try {
      if (typeof api.getCurrentUserID === "function")
        botID = String(api.getCurrentUserID());
      else
        botID = String(api.getCurrentUserID || api.botID || "");
    } catch {
      botID = String(api.botID || "");
    }

    // বট নিজে Leave করলে কিছু করবে না
    if (leftUserID === botID) return;

    console.log("[ANTILEAVE] Re-adding:", leftUserID);

    api.addUserToGroup(leftUserID, threadID, async (err) => {
      if (err) {
        console.error("ADD ERROR:", err);

        return api.sendMessage(
          `❌ AntiLeave Failed\n\n${err.errorDescription || err.message || JSON.stringify(err)}`,
          threadID
        );
      }

      console.log("✅ USER RE-ADDED");

      let userName = "Member";

      try {
        const info = await new Promise(resolve => {
          api.getUserInfo(leftUserID, (e, data) => {
            if (e) return resolve(null);
            resolve(data);
          });
        });

        if (info && info[leftUserID])
          userName = info[leftUserID].name;
      } catch {}

      api.sendMessage({
        body:
`╔════════════════════╗
║ 🔥 RIYAD BOT 🔥
╠════════════════════╣

👋 ${userName}

⚠️ আপনি গ্রুপ থেকে বের হয়েছিলেন।

✅ আপনাকে আবার গ্রুপে যুক্ত করা হয়েছে।

🛡️ AntiLeave Active

╚════════════════════╝`,
        mentions: [
          {
            tag: userName,
            id: leftUserID
          }
        ]
      }, threadID);
    });
  }
};
