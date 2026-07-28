const config = require("../../config.json");

module.exports = {
  config: {
    name: "prefix",
    aliases: ["pf"],
    version: "1.0.0",
    author: "Riyad",
    role: 0,
    permission: "0",
    category: "System",
    shortDescription: "Manage Prefix Mode",
    longDescription: "Enable/Disable No Prefix Mode and show prefix information.",
    guide: {
      en: "{pn} on | off | status"
    }
  },

  // No Prefix Listener
  async onChat({
    api,
    event
  }) {
    const body = (event.body || "").trim();
    const prefix = config.prefix;

    // Alive Message
    if (body === prefix) {
      return api.sendMessage(
`╭──────────────❀
˗ˋˏ ♡ 𝙃𝙖 𝙅𝙖𝙣𝙨 𝘽𝙤𝙡𝙤 ˎˊ˗
–❥ ˗ˋˏ ♡ 𝙀𝙩𝙖𝙞 𝘼𝙢𝙞 ˎˊ˗ ❥–
ꕤ╰( ${prefix} )╯ꕤ
╰──────────────❀,
        event.threadID
      );
    }

    // Wrong Prefix Message
    const wrongPrefixes = ["!", "?", "~", "-", "*"];

    if (wrongPrefixes.includes(body)) {
      return api.sendMessage(
`╭─〔 ⚠️ 𝗪𝗿𝗼𝗻𝗴 𝗣𝗿𝗲𝗳𝗶𝘅 〕─╮
│ ❌ That's not my prefix.
│
│ ✅ My Prefix: ${prefix}
│ 📚 Type: ${prefix}help
╰────────────────╯`,
        event.threadID
      );
    }
  },
    // Prefix Command
  async onStart({
  api,
  event,
  args,
  threadsData
}) {
  const thread = await threadsData.getThread(event.threadID);
  const settings = thread.settings || {};

  const option = (args[0] || "").toLowerCase();

  const isOwner = config.ownerIDs.includes(event.senderID);
  const isBotAdmin = config.adminIDs.includes(event.senderID) || isOwner;

  if ((option === "on" || option === "off") && !isBotAdmin) {
    return api.sendMessage(
      "❌ Only Bot Admin or Owner can change Prefix Mode.",
      event.threadID
    );
  }

    if (!["on", "off", "status"].includes(option)) {
      return api.sendMessage(
`╭━━━━━━━━━━━━━━━━━━╮
      ⚙️ 𝗣𝗥𝗘𝗙𝗜𝗫 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦
╰━━━━━━━━━━━━━━━━━━╯

📌 ${config.prefix}prefix on
➜ Enable Prefix Mode

📌 ${config.prefix}prefix off
➜ Enable No Prefix Mode

📌 ${config.prefix}prefix status
➜ View current status`,
        event.threadID
      );
    }

    if (option === "status") {
      return api.sendMessage(
`╭━━━━━━━━━━━━━━━━━━╮
      ⚙️ 𝗣𝗥𝗘𝗙𝗜𝗫 𝗦𝗧𝗔𝗧𝗨𝗦
╰━━━━━━━━━━━━━━━━━━╯

📍 Prefix : ${config.prefix}
📍 Mode : ${settings.noPrefix ? "🟢 No Prefix" : "🔒 Prefix Only"}`,
        event.threadID
      );
    }

    if (option === "on") {
      await threadsData.updateThread(event.threadID, {
        settings: {
          ...settings,
          noPrefix: false
        }
      });

      return api.sendMessage(
`✅ Prefix Mode Enabled

From now on, commands must use:

${config.prefix}help`,
        event.threadID
      );
    }

        if (option === "off") {
      await threadsData.updateThread(event.threadID, {
        settings: {
          ...settings,
          noPrefix: true
        }
      });

      return api.sendMessage(
`✅ No Prefix Mode Enabled

You can now use commands without the prefix.

Example:
help
ping
uid`,
        event.threadID
      );
    }
  }
};
