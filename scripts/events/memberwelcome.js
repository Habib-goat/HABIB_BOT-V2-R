module.exports = {
  config: {
    name: "memberWelcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData }) {
    if (event.logMessageType === "log:subscribe") {
      const { threadID } = event;
      if (!threadID) return;

      const addedParticipants = event.logMessageData && event.logMessageData.addedParticipants;
      if (!Array.isArray(addedParticipants)) return;

      // Get the bot's own user ID to make sure we don't welcome ourselves as a normal member
      const botID = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : null;

      // Fetch the group name, default to "Group Chat"
      const threadInfo = threadsData.getThread(threadID);
      const groupName = (threadInfo && threadInfo.name) ? threadInfo.name : "Group Chat";

      for (const participant of addedParticipants) {
        // Skip if the participant is the bot itself (handled by botWelcome)
        if (botID && String(participant.userFbId) === String(botID)) {
          continue;
        }

        const memberName = participant.fullName || "New Member";

        // Construct the exact welcome message requested
        const welcomeMessage = 
`✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨

꧁༒☬ ${groupName} ☬༒꧂

🌻 গ্রুপের পক্ষ থেকে 🌻

😘আপনাকে স্বাগতম 🥀

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

🌷╔═════ஓ๑♡๑ஓ═════╗🌷
🌸      ✨ WELCOME ✨        🌸
🌷╚═════ஓ๑♡๑ஓ═════╝🌷

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

⚡\u0158\u014a\u024e\u0100\u0110_\u0181\u019f\u01ac\ud83d\udd25

━━━━━━━━━━━
🎉 আপনাদের সবাইকে অভিনন্দন 🎉
━━━━━━━━━━━

✨═══❁═══✨

⭐ \ud83c\udf44 ${memberName} \ud83c\udf44⭐

✨═══❁═══✨

┊┊┊┊┊❤️

┊┊┊┊\ud83e\udde1

┊┊┊\ud83d\udc9b

┊┊\ud83d\udc9a

┊\ud83d\udc99

\ud83d\udc9c

✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨`;

        try {
          await api.sendMessage(welcomeMessage, threadID);
        } catch (err) {
          // Silent catch in case of any delivery issues to run completely in the background
        }
      }
    }
  }
};