const config = require('../../config.json');

module.exports = {
  config: {
    name: "botWelcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData }) {
    if (event.logMessageType === "log:subscribe") {
      const { threadID } = event;
      if (!threadID) return;

      // Get the bot's own user ID
      const botID = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : null;
      if (!botID) return;

      const addedParticipants = event.logMessageData && event.logMessageData.addedParticipants;
      if (!Array.isArray(addedParticipants)) return;

      // Check if the bot itself is among the added participants
      const isBotAdded = addedParticipants.some(participant => String(participant.userFbId) === String(botID));

      if (isBotAdded) {
        const botName = config.botName || "Riyad Bot";
        const prefix = config.prefix || "/";
        
        // Retrieve thread name or fallback
        const threadInfo = threadsData.getThread(threadID);
        const groupName = (threadInfo && threadInfo.name) ? threadInfo.name : "this group";

        const welcomeMessage =
`╔═❰ ⚡ SYSTEM ONLINE ⚡ ❱═╗

◈ Connected Successfully
💙 Thanks for adding me!

⌬ Added By ➤ ${adderName}
⌬ Group    ➤ ${groupName}
⌬ Bot      ➤ ${botName}
⌬ Prefix   ➤ ${prefix}

❯ ${prefix}help
❯ ${prefix}help [command]

✦ AI Assistant Activated
╚═══════════════════════╝`;

        try {
          await api.sendMessage(welcomeMessage, threadID);
        } catch (err) {
          // Fallback if formatting or API fails
          try {
            await api.sendMessage(`Hello! I am ${botName}. Type ${prefix}help to see my commands. Thank you for adding me!`, threadID);
          } catch (e) {
            // Ignore messaging errors
          }
        }
      }
    }
  }
};
