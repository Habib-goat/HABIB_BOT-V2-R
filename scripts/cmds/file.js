const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "filecmd",
    aliases: ["file"],
    version: "1.0",
    author: "rIyAd",
    countDown: 5,
    role: 2,
    shortDescription: "View code of a command",
    longDescription: "View the raw source code of any command in the commands folder",
    category: "owner",
    guide: "{pn} <commandName>"
  },

  onStart: async ({ api, event, args, usersData, threadsData }) => {
    const cmdName = args[0];
    if (!cmdName) {
      return api.sendMessage("❌ | Please provide the command name.\nExample: /filecmd fluxsnell", event.threadID, event.messageID);
    }

    const cmdPath = path.join(__dirname, `${cmdName}.js`);
    if (!fs.existsSync(cmdPath)) {
      return api.sendMessage(`❌ | Command "${cmdName}" not found in this folder.`, event.threadID, event.messageID);
    }

    try {
      const code = fs.readFileSync(cmdPath, "utf8");

      if (code.length > 19000) {
        return api.sendMessage("⚠️ | This file is too large to display.", event.threadID, event.messageID);
      }

      return api.sendMessage(`📄 | Source code of "${cmdName}.js":\n\n${code}`, event.threadID, event.messageID);
    } catch (err) {
      console.error(err);
      return api.sendMessage("❌ | Error reading the file.", event.threadID, event.messageID);
    }
  }
};
