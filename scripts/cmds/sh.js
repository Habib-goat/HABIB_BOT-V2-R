const { exec } = require("child_process");

module.exports = {
  config: {
    name: "sh",
    version: "1.0.0",
    author: "Ami Tor Abba",
    role: 2,
    category: "owner",
    guide: "{pn} <shell command>"
  },

  onStart: async function ({ api, event, args }) {
    const cmd = args.join(" ").trim();

    if (!cmd) {
      return api.sendMessage(
        "❌ | Usage:\n/sh <shell command>",
        event.threadID,
        event.messageID
      );
    }

    exec(
      cmd,
      {
        timeout: 10000,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        let output = "";

        if (error) {
          output += `❌ Error:\n${error.message}\n\n`;
        }

        if (stderr) {
          output += `⚠️ STDERR:\n${stderr}\n\n`;
        }

        if (stdout) {
          output += `✅ STDOUT:\n${stdout}`;
        }

        if (!output.trim()) {
          output = "✅ Command executed successfully.\n(No output)";
        }

        if (output.length > 3900) {
          output = output.slice(0, 3900) + "\n\n...Output truncated.";
        }

        api.sendMessage(output, event.threadID, event.messageID);
      }
    );
  }
};
