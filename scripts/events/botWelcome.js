const config = require('../../config.json');

module.exports = {
  config: {
    name: "botWelcome",
    eventType: ["log:subscribe"],
    version: "1.0.1",
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
        // FIXED: getThread returns a Promise — this was never awaited, so
        // `threadInfo` was always a pending Promise (never the actual thread).
        let threadInfo = null;
        try {
          threadInfo = await threadsData.getThread(threadID);
        } catch (e) {
          // ignore, fall back to default group name below
        }
        const groupName = (threadInfo && threadInfo.name) ? threadInfo.name : "this group";

        // FIXED: `adderName` was referenced below but never defined anywhere —
        // that ReferenceError crashed this whole function before sendMessage
        // ever ran, which is why the bot-join welcome message never appeared.
        let adderName = "Someone";
        try {
          if (typeof api.getUserInfo === "function" && event.author) {
            const info = await new Promise((resolve, reject) => {
              api.getUserInfo(event.author, (err, data) => {
                if (err) return reject(err);
                resolve(data);
              });
            });
            if (info && info[event.author]?.name) {
              adderName = info[event.author].name;
            }
          }
        } catch (e) {
          // keep fallback "Someone"
        }

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
