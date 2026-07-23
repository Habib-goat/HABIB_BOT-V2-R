module.exports = {
  config: {
    name: "memberWelcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!Array.isArray(addedParticipants)) return;

    const botID =
      typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : "";

    let groupName = "Group Chat";

    try {
      if (typeof api.getThreadInfo === "function") {
        const info = await new Promise((resolve, reject) => {
          api.getThreadInfo(threadID, (err, data) => {
            if (err) return reject(err);
            resolve(data);
          });
        });

        groupName =
          info?.threadName ||
          info?.name ||
          "Group Chat";
      } else {
        const threadInfo = await threadsData.getThread(threadID);
        groupName = threadInfo?.name || "Group Chat";
      }
    } catch {
      try {
        const threadInfo = await threadsData.getThread(threadID);
        groupName = threadInfo?.name || "Group Chat";
      } catch {}
    }

    for (const participant of addedParticipants) {
      if (botID && String(participant.userFbId) === botID)
        continue;

      const memberName =
        participant.fullName || "New Member";

      const welcomeMessage = `✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨

꧁༒☬ ${groupName} ☬༒꧂

🌻 গ্রুপের পক্ষ থেকে 🌻

😘আপনাকে স্বাগতম 🥀

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

🌷╔═════ஓ๑♡๑ஓ═════╗🌷
🌸      ✨ WELCOME ✨        🌸
🌷╚═════ஓ๑♡๑ஓ═════╝🌷

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

⚡ŘŊɎĀĐ_ƁƟƬ🔥

━━━━━━━━━━━
🎉 আপনাদের সবাইকে অভিনন্দন 🎉
━━━━━━━━━━━

✨═══❁═══✨

   ⭐ 🍄 ${memberName} 🍄⭐

✨═══❁═══✨

┊┊┊┊┊❤️

┊┊┊┊🧡

┊┊┊💛

┊┊💚

┊💙

💜

✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨`;

      try {
        await api.sendMessage(welcomeMessage, threadID);
      } catch (err) {
        console.error("[WELCOME ERROR]", err);
      }
    }
  }
};
