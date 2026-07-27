/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Command Manager ("cmd.js") for Riyad Bot
// Professional, robust, and full-featured command manager.
const replyManager = require("../replies/replyManager");
const axios = require("axios");
const { execSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");

// Local cache for pending confirmations
const pendingConfirmations = new Map();

// Helper to safely send message
function sendMessage(api, threadID, text, messageID) {
  return new Promise((resolve) => {
    api.sendMessage(text, threadID, (err, info) => {
      resolve(info || null);
    }, messageID);
  });
}

// Find all command & alias registries in the environment
function findRegistries() {
  const registries = [];
  if (global.client) {
    if (global.client.commands instanceof Map) {
      registries.push({
        commands: global.client.commands,
        aliases: global.client.aliases || new Map()
      });
    }
  }
  if (global.commands instanceof Map) {
    registries.push({
      commands: global.commands,
      aliases: global.aliases || new Map()
    });
  }
  if (global.RiyadBot && global.RiyadBot.commands instanceof Map) {
    registries.push({
      commands: global.RiyadBot.commands,
      aliases: global.RiyadBot.aliases || new Map()
    });
  }
  return registries;
}

// Extract JS code from Markdown code block if present
function extractCode(text) {
  if (!text) return "";
  const match = text.match(/```(?:javascript|js)?\s*([\s\S]*?)\s*```/);
  return match ? match[1].trim() : text.trim();
}

// Safe check of syntax by writing to temp file and requiring it
function validateCommandSource(tempName, rawCode) {
  const tempPath = path.join(__dirname, `_temp_val_${tempName}_${Date.now()}.js`);
  try {
    fs.writeFileSync(tempPath, rawCode, "utf8");
    const testCmd = require(tempPath);
    
    if (!testCmd || typeof testCmd !== "object") {
      throw new Error("File must export an object containing command structure.");
    }
    if (!testCmd.config || typeof testCmd.config !== "object") {
      throw new Error("Missing or invalid 'config' object in export.");
    }
    if (!testCmd.config.name || typeof testCmd.config.name !== "string") {
      throw new Error("Missing or invalid 'config.name' string.");
    }
    if (!testCmd.onStart || typeof testCmd.onStart !== "function") {
      throw new Error("Missing or invalid 'onStart' function.");
    }
    
    // Cleanup required module cache and temp file
    delete require.cache[require.resolve(tempPath)];
    fs.removeSync(tempPath);
    return { valid: true, name: testCmd.config.name, config: testCmd.config };
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        delete require.cache[require.resolve(tempPath)];
        fs.removeSync(tempPath);
      }
    } catch (_) {}
    return { valid: false, error: error.message };
  }
}

// Unload command from registry
function unloadCommandFromRegistry(commandName) {
  const registries = findRegistries();
  for (const reg of registries) {
    const cmd = reg.commands.get(commandName);
    if (cmd && cmd.config && cmd.config.aliases) {
      const aliases = Array.isArray(cmd.config.aliases) ? cmd.config.aliases : [cmd.config.aliases];
      for (const alias of aliases) {
        reg.aliases.delete(alias);
      }
    }
    reg.commands.delete(commandName);
  }
}

// Load or hot-reload command file
function loadCommandIntoRegistry(filePath, commandName) {
  try {
    delete require.cache[require.resolve(filePath)];
    const command = require(filePath);
    if (!command || !command.config || !command.config.name) return false;

    const registries = findRegistries();
    for (const reg of registries) {
      // Remove old instances first
      unloadCommandFromRegistry(command.config.name);
      
      // Load new instance
      reg.commands.set(command.config.name, command);
      if (command.config.aliases) {
        const aliases = Array.isArray(command.config.aliases) ? command.config.aliases : [command.config.aliases];
        for (const alias of aliases) {
          reg.aliases.set(alias, command.config.name);
        }
      }
    }
    return true;
  } catch (error) {
    console.error(`[cmd.js] Hot reload error for ${commandName}:`, error);
    return false;
  }
}

module.exports = {
  config: {
    name: "cmd",
    aliases: ["cmdman", "command"],
    version: "2.0.0",
    author: "Riyad",
    role: 2,
    category: "system",
    description: "Manage, reload, install, backup, and diagnose bot commands",
    guide: "/cmd\n/cmd list [page]\n/cmd info [command]\n/cmd search [query]\n/cmd reload [all/command]\n/cmd load [all/command]\n/cmd unload [command]\n/cmd install\n/cmd enable/disable [command]\n/cmd backup/restore\n/cmd check/doctor"
  },

  onStart: async function({ api, event, args }) {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const senderID = event.senderID;

    const sub = (args[0] || "").toLowerCase();

    // -------------------------------------------------------------
    // DEFAULT & LIST COMMAND
    // -------------------------------------------------------------
    if (!sub || sub === "list") {
      try {
        const files = fs.readdirSync(__dirname);
        const jsFiles = files.filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
        const disabledFiles = files.filter(f => f.endsWith(".disabled"));

        jsFiles.sort();
        disabledFiles.sort();

        const totalActive = jsFiles.length;
        const totalDisabled = disabledFiles.length;

        // Collect all items to show
        const allItems = [];
        for (const file of jsFiles) {
          try {
            const commandName = file.replace(".js", "");
            const filePath = path.join(__dirname, file);
            const cmd = require(filePath);
            allItems.push({
              name: commandName,
              version: cmd.config?.version || "1.0.0",
              category: cmd.config?.category || "general",
              active: true
            });
          } catch (_) {
            allItems.push({
              name: file.replace(".js", ""),
              version: "ERROR",
              category: "unknown",
              active: true,
              corrupt: true
            });
          }
        }

        for (const file of disabledFiles) {
          const commandName = file.replace(".js.disabled", "").replace(".disabled", "");
          allItems.push({
            name: commandName,
            version: "N/A",
            category: "disabled",
            active: false
          });
        }

        const itemsPerPage = 8;
        const pageArg = parseInt(args[1]) || 1;
        const totalPages = Math.ceil(allItems.length / itemsPerPage) || 1;
        const page = Math.max(1, Math.min(pageArg, totalPages));
        const startIndex = (page - 1) * itemsPerPage;
        const pageItems = allItems.slice(startIndex, startIndex + itemsPerPage);

        let msg = "╭───────────────────╮\n";
        msg += "  ✪𝐑𝐈𝐘𝐀𝐃 𝐁𝐎𝐓 - 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒✪\n";
        msg += "╰───────────────────╯\n\n";
        msg += ` ➜ 𝐀𝐜𝐭𝐢𝐯𝐞: ${totalActive} | 𝐃𝐢𝐬𝐚𝐛𝐥𝐞𝐝: ${totalDisabled}\n`;
        msg += ` ➜ 𝐏𝐚𝐠𝐞: ${page}/${totalPages}\n\n`;

        pageItems.forEach((item, idx) => {
          const num = startIndex + idx + 1;
          const statusIcon = item.corrupt ? "⚠️" : (item.active ? "🟢" : "🔴");
          msg += `  ${num}. ${statusIcon} ╭─ [ ${item.name} ]\n`;
          msg += `     ├─ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧: ${item.version}\n`;
          msg += `     ╰─ 𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐲: ${item.category}\n\n`;
        });

        msg += "───────────────────────\n";
        msg += "💡 𝐔𝐬𝐞 \"/cmd list [page]\" to paginate\n";
        msg += "💡 𝐔𝐬𝐞 \"/cmd info [name]\" for details";

        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to fetch command list: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // INFO COMMAND
    // -------------------------------------------------------------
    if (sub === "info") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please supply a command name.\nExample: /cmd info help", messageID);
      }

      const filePath = path.join(__dirname, `${targetName}.js`);
      if (!fs.existsSync(filePath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command file "${targetName}.js" not found.`, messageID);
      }

      try {
        delete require.cache[require.resolve(filePath)];
        const cmd = require(filePath);
        if (!cmd || !cmd.config) {
          return await sendMessage(api, threadID, `⚠️ [𝐈𝐍𝐅𝐎] ➜ Command file exists but lacks exports or config.`, messageID);
        }

        const config = cmd.config;
        let msg = "╭─────────────────────╮\n";
        msg += `   ℹ️ 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍\n`;
        msg += "╰─────────────────────╯\n\n";
        msg += `  • 𝐍𝐚𝐦𝐞: ${config.name}\n`;
        msg += `  • 𝐀𝐥𝐢𝐚𝐬𝐞𝐬: ${Array.isArray(config.aliases) ? config.aliases.join(", ") : (config.aliases || "None")}\n`;
        msg += `  • 𝐕𝐞𝐫𝐬𝐢𝐨𝐧: ${config.version || "1.0.0"}\n`;
        msg += `  • 𝐀𝐮𝐭𝐡𝐨𝐫: ${config.author || "Riyad"}\n`;
        msg += `  • 𝐑𝐨𝐥𝐞: ${config.role !== undefined ? config.role : 2}\n`;
        msg += `  • 𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐲: ${config.category || "system"}\n`;
        msg += `  • 𝐃𝐞𝐬𝐜𝐫𝐢𝐩𝐭𝐢𝐨𝐧: ${config.description || "No description provided"}\n\n`;
        msg += `  ─── [ 𝐔𝐬𝐚𝐠𝐞 𝐆𝐮𝐢𝐝𝐞 ] ───\n`;
        msg += `${config.guide || "No usage guide provided."}`;

        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Could not parse command info: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // SEARCH COMMAND
    // -------------------------------------------------------------
    if (sub === "search") {
      const query = (args.slice(1).join(" ") || "").toLowerCase();
      if (!query) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please enter a keyword to search.", messageID);
      }

      try {
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
        const results = [];

        for (const file of files) {
          try {
            const filePath = path.join(__dirname, file);
            delete require.cache[require.resolve(filePath)];
            const cmd = require(filePath);
            if (cmd && cmd.config) {
              const name = cmd.config.name || "";
              const desc = cmd.config.description || "";
              const cat = cmd.config.category || "";
              const aliases = Array.isArray(cmd.config.aliases) ? cmd.config.aliases.join(" ") : (cmd.config.aliases || "");

              if (
                name.toLowerCase().includes(query) ||
                desc.toLowerCase().includes(query) ||
                cat.toLowerCase().includes(query) ||
                aliases.toLowerCase().includes(query)
              ) {
                results.push(cmd.config);
              }
            }
          } catch (_) {}
        }

        if (results.length === 0) {
          return await sendMessage(api, threadID, `🔍 [𝐒𝐄𝐀𝐑𝐂𝐇] ➜ No commands found matching "${query}".`, messageID);
        }

        let msg = `🔍 [𝐒𝐄𝐀𝐑𝐂𝐇] ➜ Found ${results.length} results:\n──────────────────────\n\n`;
        results.forEach((cmd, idx) => {
          msg += `  ${idx + 1}. 🟢 ${cmd.name} (v${cmd.version || "1.0.0"})\n`;
          msg += `     └─ ${cmd.description || "No description"}\n\n`;
        });

        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Search failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // COUNT COMMAND
    // -------------------------------------------------------------
    if (sub === "count") {
      try {
        const files = fs.readdirSync(__dirname);
        const activeFiles = files.filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
        const disabledFiles = files.filter(f => f.endsWith(".disabled"));

        const categoryCounts = {};
        let activeCount = 0;
        let corruptCount = 0;

        for (const file of activeFiles) {
          try {
            const cmd = require(path.join(__dirname, file));
            const cat = cmd?.config?.category || "general";
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            activeCount++;
          } catch (_) {
            corruptCount++;
          }
        }

        let msg = "📊 [𝐂𝐎𝐔𝐍𝐓] ➜ Command Diagnostics Count:\n───────────────────────\n\n";
        msg += `  • 𝐓𝐨𝐭𝐚𝐥 𝐀𝐜𝐭𝐢𝐯𝐞: ${activeCount}\n`;
        msg += `  • 𝐓𝐨𝐭𝐚𝐥 𝐃𝐢𝐬𝐚𝐛𝐥𝐞𝐝: ${disabledFiles.length}\n`;
        msg += `  • 𝐂𝐨𝐫𝐫𝐮𝐩𝐭/𝐁𝐫𝐨𝐤𝐞𝐧: ${corruptCount}\n\n`;
        msg += "─── [ Categories Breakdown ] ───\n";
        
        Object.entries(categoryCounts).forEach(([cat, count]) => {
          msg += `  • ${cat.toUpperCase()}: ${count} command(s)\n`;
        });

        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Count calculation failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // INSTALL COMMAND
    // -------------------------------------------------------------
    if (sub === "install") {
      let rawCode = "";
      let fileName = "";
      
      const reply = event.messageReply || event.message_reply;

      // Case A: Reply to an attachment or body
      if (reply) {
        // A.1 JS Attachment
        if (reply.attachments && reply.attachments.length > 0) {
          const jsAttachment = reply.attachments.find(att => 
            att.type === "file" && att.filename && att.filename.endsWith(".js")
          );
          if (jsAttachment) {
            try {
              const res = await axios.get(jsAttachment.url, { responseType: "text" });
              rawCode = res.data;
              fileName = args[1] || jsAttachment.filename;
            } catch (err) {
              return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to download attached file: ${err.message}`, messageID);
            }
          }
        }
        
        // A.2 If no code fetched yet, check replied body
        if (!rawCode && reply.body) {
          rawCode = extractCode(reply.body);
          fileName = args[1] || "";
        }
      }

      // Case B: Install from URL
      if (!rawCode && args[1] && args[1].match(/^https?:\/\//)) {
        let url = args[1];
        fileName = args[2] || "";

        // Normalize Pastebin
        if (url.includes("pastebin.com") && !url.includes("/raw/")) {
          url = url.replace("pastebin.com/", "pastebin.com/raw/");
        }
        // Normalize GitHub
        if (url.includes("github.com") && url.includes("/blob/")) {
          url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
        }

        try {
          const res = await axios.get(url, { responseType: "text" });
          rawCode = res.data;
        } catch (err) {
          return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to download from URL: ${err.message}`, messageID);
        }
      }

      // Case C: Install via Inline Code /cmd install filename.js <code>
      if (!rawCode && args[1] && args[1].endsWith(".js") && args.length > 2) {
        fileName = args[1];
        rawCode = extractCode(args.slice(2).join(" "));
      }

      if (!rawCode) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Could not retrieve command code. Use a valid raw URL, reply to JS code, or supply inline source code.", messageID);
      }

      // Safe validate
      const validation = validateCommandSource(fileName || "new", rawCode);
      if (!validation.valid) {
        return await sendMessage(api, threadID, `❌ [𝐒𝐘𝐍𝐓𝐀𝐗 𝐄𝐑𝐑𝐎𝐑] ➜ File is not a valid Riyad Bot command:\n${validation.error}`, messageID);
      }

      // Determine correct filename
      if (!fileName) {
        fileName = `${validation.name}.js`;
      }
      if (!fileName.endsWith(".js")) {
        fileName += ".js";
      }

      const destPath = path.join(__dirname, fileName);

      // Overwrite Check
      if (fs.existsSync(destPath)) {
        const isForce = args.includes("force") || args.includes("-f") || args.includes("overwrite");
        if (isForce) {
          try {
            fs.writeFileSync(destPath, rawCode, "utf8");
            const hotReloaded = loadCommandIntoRegistry(destPath, fileName.replace(".js", ""));
            let successMsg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Forced overwrite completed. Installed as "${fileName}".`;
            if (hotReloaded) {
              successMsg += "\n🟢 Hot-reload completed successfully.";
            } else {
              successMsg += "\n⚠️ Hot-reload could not be verified in this environment.";
            }
            return await sendMessage(api, threadID, successMsg, messageID);
          } catch (err) {
            return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Forced overwrite failed: ${err.message}`, messageID);
          }
        }

        const msgText = `⚠️ [𝐂𝐎𝐍𝐅𝐈𝐑𝐌𝐀𝐓𝐈𝐎𝐍] ➜ The command "${fileName}" already exists.\nReply to this message with "yes" or "no" to overwrite and hot-reload.`;
        const sentMsg = await sendMessage(api, threadID, msgText, messageID);
        if (sentMsg) {
          pendingConfirmations.set(sentMsg.messageID, {
            commandName: "cmd",
            messageID: sentMsg.messageID,
            type: "install_overwrite",
            author: senderID,
            data: { fileName, rawCode }
          });
        }
        replyManager.set(sentMsg.messageID, {
  commandName: "cmd",
  author: senderID
});
        return;
      }

      // Save and Hot reload
      try {
        fs.writeFileSync(destPath, rawCode, "utf8");
        const hotReloaded = loadCommandIntoRegistry(destPath, fileName.replace(".js", ""));
        let successMsg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command installed as "${fileName}".`;
        if (hotReloaded) {
          successMsg += "\n🟢 Hot-reload completed successfully.";
        } else {
          successMsg += "\n⚠️ Hot-reload could not be verified in this environment.";
        }
        return await sendMessage(api, threadID, successMsg, messageID);
      } catch (err) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to write command file: ${err.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // DELETE COMMAND
    // -------------------------------------------------------------
    if (sub === "delete") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please enter the name of the command to delete.", messageID);
      }

      if (targetName === "cmd") {
        return await sendMessage(api, threadID, "❌ [𝐄𝐑𝐑𝐎𝐑] ➜ For security reasons, you cannot delete the command manager itself.", messageID);
      }

      const filePath = path.join(__dirname, `${targetName}.js`);
      const disabledPath = path.join(__dirname, `${targetName}.js.disabled`);

      let targetPath = "";
      if (fs.existsSync(filePath)) {
        targetPath = filePath;
      } else if (fs.existsSync(disabledPath)) {
        targetPath = disabledPath;
      }

      if (!targetPath) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command "${targetName}" does not exist.`, messageID);
      }

      try {
        unloadCommandFromRegistry(targetName);
        fs.removeSync(targetPath);
        return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Successfully deleted command "${targetName}".`, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to delete command: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // ENABLE COMMAND
    // -------------------------------------------------------------
    if (sub === "enable") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please enter the name of the command to enable.", messageID);
      }

      const disabledPath = path.join(__dirname, `${targetName}.js.disabled`);
      const standardDisabledPath = path.join(__dirname, `${targetName}.disabled`);
      const destPath = path.join(__dirname, `${targetName}.js`);

      let foundSource = "";
      if (fs.existsSync(disabledPath)) {
        foundSource = disabledPath;
      } else if (fs.existsSync(standardDisabledPath)) {
        foundSource = standardDisabledPath;
      }

      if (!foundSource) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Disabled command "${targetName}" not found.`, messageID);
      }

      try {
        fs.renameSync(foundSource, destPath);
        const loaded = loadCommandIntoRegistry(destPath, targetName);
        let successMsg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command "${targetName}" has been enabled.`;
        if (loaded) {
          successMsg += "\n🟢 Hot-loaded into bot registry.";
        }
        return await sendMessage(api, threadID, successMsg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to enable command: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // DISABLE COMMAND
    // -------------------------------------------------------------
    if (sub === "disable") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please enter the name of the command to disable.", messageID);
      }

      if (targetName === "cmd") {
        return await sendMessage(api, threadID, "❌ [𝐄𝐑𝐑𝐎𝐑] ➜ For safety reasons, you cannot disable the command manager.", messageID);
      }

      const filePath = path.join(__dirname, `${targetName}.js`);
      if (!fs.existsSync(filePath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Active command "${targetName}" not found.`, messageID);
      }

      try {
        unloadCommandFromRegistry(targetName);
        const destPath = path.join(__dirname, `${targetName}.js.disabled`);
        fs.renameSync(filePath, destPath);
        return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command "${targetName}" has been disabled.`, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to disable command: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // RENAME COMMAND
    // -------------------------------------------------------------
    if (sub === "rename") {
      const oldName = args[1];
      const newName = args[2];

      if (!oldName || !newName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please supply both the old name and new name.\nExample: /cmd rename test tester", messageID);
      }

      if (oldName === "cmd") {
        return await sendMessage(api, threadID, "❌ [𝐄𝐑𝐑𝐎𝐑] ➜ You cannot rename the command manager itself.", messageID);
      }

      const oldPath = path.join(__dirname, `${oldName}.js`);
      const newPath = path.join(__dirname, `${newName}.js`);

      if (!fs.existsSync(oldPath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command "${oldName}.js" does not exist.`, messageID);
      }

      if (fs.existsSync(newPath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ A file named "${newName}.js" already exists.`, messageID);
      }

      try {
        // Attempt to update file contents name
        let content = fs.readFileSync(oldPath, "utf8");
        // Regex to replace config name
        content = content.replace(/(name\s*:\s*['"])([^'"]+)(['"])/, `$1${newName}$3`);
        
        unloadCommandFromRegistry(oldName);
        fs.writeFileSync(newPath, content, "utf8");
        fs.removeSync(oldPath);

        const loaded = loadCommandIntoRegistry(newPath, newName);
        let successMsg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Renamed "${oldName}" to "${newName}".`;
        if (loaded) {
          successMsg += "\n🟢 Hot-loaded the updated command.";
        }
        return await sendMessage(api, threadID, successMsg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to rename command: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // RELOAD COMMAND
    // -------------------------------------------------------------
    if (sub === "reload") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please supply a command to reload or use 'all'.", messageID);
      }

      if (targetName === "all") {
        try {
          const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
          let reloadedCount = 0;
          let failedCount = 0;
          const errors = [];

          for (const file of files) {
            const filePath = path.join(__dirname, file);
            const cmdName = file.replace(".js", "");
            try {
              const loaded = loadCommandIntoRegistry(filePath, cmdName);
              if (loaded) reloadedCount++;
              else failedCount++;
            } catch (err) {
              failedCount++;
              errors.push(`${cmdName}: ${err.message}`);
            }
          }

          let msg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Reload Complete:\n──────────────────────\n`;
          msg += `  • 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲 𝐑𝐞𝐥𝐨𝐚𝐝𝐞𝐝: ${reloadedCount}\n`;
          msg += `  • 𝐅𝐚𝐢𝐥𝐞𝐝: ${failedCount}`;
          if (errors.length > 0) {
            msg += `\n\n─── [ Failures ] ───\n` + errors.join("\n");
          }
          return await sendMessage(api, threadID, msg, messageID);
        } catch (error) {
          return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Reload all failed: ${error.message}`, messageID);
        }
      }

      const filePath = path.join(__dirname, `${targetName}.js`);
      if (!fs.existsSync(filePath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command "${targetName}.js" not found.`, messageID);
      }

      try {
        const loaded = loadCommandIntoRegistry(filePath, targetName);
        if (loaded) {
          return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command "${targetName}" reloaded and registry updated.`, messageID);
        } else {
          return await sendMessage(api, threadID, `⚠️ [𝐈𝐍𝐅𝐎] ➜ Command "${targetName}" parsed successfully, but registry hot-reload was skipped.`, messageID);
        }
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Reloading "${targetName}" failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // LOAD COMMAND
    // -------------------------------------------------------------
    if (sub === "load") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please supply a command to load or use 'all'.", messageID);
      }

      if (targetName === "all") {
        try {
          const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
          let loadedCount = 0;
          let failedCount = 0;
          const errors = [];

          for (const file of files) {
            const filePath = path.join(__dirname, file);
            const cmdName = file.replace(".js", "");
            try {
              const loaded = loadCommandIntoRegistry(filePath, cmdName);
              if (loaded) loadedCount++;
              else failedCount++;
            } catch (err) {
              failedCount++;
              errors.push(`${cmdName}: ${err.message}`);
            }
          }

          let msg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Load All Complete:\n───────────────────────\n`;
          msg += `  • 𝐒𝐮𝐜𝐜𝐞𝐬𝐬𝐟𝐮𝐥𝐥𝐲 𝐋𝐨𝐚𝐝𝐞𝐝: ${loadedCount}\n`;
          msg += `  • 𝐅𝐚𝐢𝐥𝐞𝐝: ${failedCount}`;
          if (errors.length > 0) {
            msg += `\n\n─── [ Failures ] ───\n` + errors.join("\n");
          }
          return await sendMessage(api, threadID, msg, messageID);
        } catch (error) {
          return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Load all failed: ${error.message}`, messageID);
        }
      }

      let cmdName = targetName;
      if (cmdName.endsWith(".js")) {
        cmdName = cmdName.slice(0, -3);
      }
      const filePath = path.join(__dirname, `${cmdName}.js`);
      if (!fs.existsSync(filePath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command file "${cmdName}.js" not found.`, messageID);
      }

      try {
        const loaded = loadCommandIntoRegistry(filePath, cmdName);
        if (loaded) {
          return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command "${cmdName}" loaded into registry successfully.`, messageID);
        } else {
          return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to load command "${cmdName}". The file might be corrupt or missing config.`, messageID);
        }
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Loading "${cmdName}" failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // UNLOAD COMMAND
    // -------------------------------------------------------------
    if (sub === "unload") {
      const targetName = args[1];
      if (!targetName) {
        return await sendMessage(api, threadID, "⚠️ [𝐈𝐍𝐅𝐎] ➜ Please enter the name of the command to unload.", messageID);
      }

      let cmdName = targetName;
      if (cmdName.endsWith(".js")) {
        cmdName = cmdName.slice(0, -3);
      }

      if (cmdName === "cmd") {
        return await sendMessage(api, threadID, "❌ [𝐄𝐑𝐑𝐎𝐑] ➜ For security reasons, you cannot unload the command manager itself.", messageID);
      }

      // Check if command is registered or file exists
      const registries = findRegistries();
      let isRegistered = false;
      for (const reg of registries) {
        if (reg.commands.has(cmdName)) {
          isRegistered = true;
          break;
        }
      }

      const filePath = path.join(__dirname, `${cmdName}.js`);
      if (!isRegistered && !fs.existsSync(filePath)) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command "${cmdName}" is not loaded in registry and file does not exist.`, messageID);
      }

      try {
        unloadCommandFromRegistry(cmdName);
        return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command "${cmdName}" has been successfully unloaded from registry.`, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Failed to unload command: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // BACKUP COMMAND
    // -------------------------------------------------------------
    if (sub === "backup") {
      const backupDir = path.join(__dirname, "..", "cmds_backup");
      try {
        fs.ensureDirSync(backupDir);
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") || f.endsWith(".disabled"));
        let count = 0;

        for (const file of files) {
          fs.copySync(path.join(__dirname, file), path.join(backupDir, file));
          count++;
        }

        return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Backed up ${count} files to backup directory:\n"${backupDir.replace(process.cwd(), "")}"`, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Backup failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // RESTORE COMMAND
    // -------------------------------------------------------------
    if (sub === "restore") {
      const backupDir = path.join(__dirname, "..", "cmds_backup");
      if (!fs.existsSync(backupDir)) {
        return await sendMessage(api, threadID, "❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Backup directory not found. Please create a backup first.", messageID);
      }

      try {
        const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".js") || f.endsWith(".disabled"));
        let count = 0;

        for (const file of files) {
          fs.copySync(path.join(backupDir, file), path.join(__dirname, file));
          // Load active restored commands
          if (file.endsWith(".js")) {
            loadCommandIntoRegistry(path.join(__dirname, file), file.replace(".js", ""));
          }
          count++;
        }

        return await sendMessage(api, threadID, `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Restored and hot-loaded ${count} files from backup.`, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Restore failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // CHECK COMMAND
    // -------------------------------------------------------------
    if (sub === "check") {
      try {
        const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !f.startsWith("_temp_"));
        const duplicates = {};
        const aliases = {};
        const reports = [];

        for (const file of files) {
          const filePath = path.join(__dirname, file);
          try {
            delete require.cache[require.resolve(filePath)];
            const cmd = require(filePath);
            const cmdName = cmd?.config?.name;

            if (!cmdName) {
              reports.push(`⚠️ ${file}: Missing command name inside config.`);
              continue;
            }

            if (duplicates[cmdName]) {
              duplicates[cmdName].push(file);
            } else {
              duplicates[cmdName] = [file];
            }

            if (cmd.config.aliases) {
              const cmdAliases = Array.isArray(cmd.config.aliases) ? cmd.config.aliases : [cmd.config.aliases];
              for (const alias of cmdAliases) {
                if (aliases[alias]) {
                  aliases[alias].push(cmdName);
                } else {
                  aliases[alias] = [cmdName];
                }
              }
            }

            if (!cmd.onStart) {
              reports.push(`⚠️ ${file}: Missing 'onStart' handler.`);
            }

          } catch (err) {
            reports.push(`❌ ${file}: Syntax/Load Error - ${err.message}`);
          }
        }

        // Add duplicate reports
        Object.entries(duplicates).forEach(([name, countFiles]) => {
          if (countFiles.length > 1) {
            reports.push(`❌ Duplicate Command Name "${name}" in files: ${countFiles.join(", ")}`);
          }
        });

        // Add duplicate alias reports
        Object.entries(aliases).forEach(([alias, commandsList]) => {
          if (commandsList.length > 1) {
            reports.push(`❌ Duplicate Alias "${alias}" registered by: ${commandsList.join(", ")}`);
          }
        });

        if (reports.length === 0) {
          return await sendMessage(api, threadID, "✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Command check completed! All active commands are healthy.", messageID);
        }

        let msg = `🩺 [𝐂𝐇𝐄𝐂𝐊] ➜ Found ${reports.length} issue(s):\n──────────────────────────\n\n`;
        msg += reports.join("\n\n");
        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Command check failed: ${error.message}`, messageID);
      }
    }

    // -------------------------------------------------------------
    // DOCTOR (SYSTEM DIAGNOSTICS)
    // -------------------------------------------------------------
    if (sub === "doctor") {
      try {
        let msg = "🩺 [𝐃𝐎𝐂𝐓𝐎𝐑] ➜ System Health Diagnostics:\n───────────────────────\n\n";

        // Check 1: Directory Permissions
        try {
          fs.accessSync(__dirname, fs.constants.R_OK | fs.constants.W_OK);
          msg += "  • 𝐃𝐢𝐫𝐞𝐜𝐭𝐨𝐫𝐲 𝐀𝐜𝐜𝐞𝐬𝐬: 🟢 Read/Write Healthy\n";
        } catch (_) {
          msg += "  • 𝐃𝐢𝐫𝐞𝐜𝐭𝐨𝐫𝐲 𝐀𝐜𝐜𝐞𝐬𝐬: 🔴 Read/Write Restrained\n";
        }

        // Check 2: Node Environment
        msg += `  • 𝐍𝐨𝐝𝐞 𝐕𝐞𝐫𝐬𝐢𝐨𝐧: 🟢 ${process.version}\n`;
        msg += `  • 𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦: 🟢 ${process.platform}\n`;

        // Check 3: Memory usage
        const mem = process.memoryUsage();
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        msg += `  • 𝐑𝐒𝐒 𝐌𝐞𝐦𝐨𝐫𝐲: 🟢 ${rssMB} MB\n`;
        msg += `  • 𝐇𝐞𝐚𝐩 𝐌𝐞𝐦𝐨𝐫𝐲: 🟢 ${heapUsedMB} MB\n`;

        // Check 4: Registry Health
        const registries = findRegistries();
        if (registries.length > 0) {
          msg += `  • 𝐑𝐞𝐠𝐢𝐬𝐭𝐫𝐲 𝐒𝐭𝐚𝐭𝐮𝐬: 🟢 Found ${registries.length} active bot registries.\n`;
        } else {
          msg += `  • 𝐑e𝐠𝐢𝐬𝐭𝐫𝐲 𝐒𝐭𝐚𝐭𝐮𝐬: ⚠️ Offline / Standalone mode. Run bot to verify hot reload.\n`;
        }

        // Check 5: Dependencies sanity
        try {
          require("axios");
          msg += "  • 𝐀𝐱𝐢𝐨𝐬: 🟢 Installed\n";
        } catch (_) {
          msg += "  • 𝐀𝐱𝐢𝐨𝐬: 🔴 Missing\n";
        }

        try {
          require("fs-extra");
          msg += "  • 𝐅𝐬-𝐄𝐱𝐭𝐫𝐚: 🟢 Installed\n";
        } catch (_) {
          msg += "  • 𝐅𝐬-𝐄𝐱𝐭𝐫𝐚: 🔴 Missing\n";
        }

        return await sendMessage(api, threadID, msg, messageID);
      } catch (error) {
        return await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Doctor diagnostics failed: ${error.message}`, messageID);
      }
    }

    // Default to displaying guide if command unknown
    return await sendMessage(api, threadID, `⚠️ [𝐈𝐍𝐅𝐎] ➜ Unknown subcommand. Here is the usage guide:\n\n${module.exports.config.guide}`, messageID);
  },

onReply: async function({ api, event, Reply }) {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const senderID = event.senderID;
    const body = event.body;
    
    if (!Reply || !body) return;

const pending = pendingConfirmations.get(Reply.messageID);
    if (!pending) return;

    if (senderID !== pending.author) return;

    const answer = body.trim().toLowerCase();
    if (answer === "yes" || answer === "y") {
    pendingConfirmations.delete(Reply.messageID);
    replyManager.delete(Reply.messageID);
      const { type, data } = pending;
      if (type === "install_overwrite") {
        const { fileName, rawCode } = data;
        const destPath = path.join(__dirname, fileName);
        try {
          fs.writeFileSync(destPath, rawCode, "utf8");
          const hotReloaded = loadCommandIntoRegistry(destPath, fileName.replace(".js", ""));
          let msg = `✨ [𝐒𝐔𝐂𝐂𝐄𝐒𝐒] ➜ Overwrite completed. Installed as "${fileName}".`;
          if (hotReloaded) {
            msg += "\n🟢 Hot-loaded into bot registry successfully.";
          }
          await sendMessage(api, threadID, msg, messageID);
        } catch (err) {
          await sendMessage(api, threadID, `❌ [𝐄𝐑𝐑𝐎𝐑] ➜ Overwrite failed: ${err.message}`, messageID);
        }
      }
    } else if (answer === "no" || answer === "n") {
    pendingConfirmations.delete(Reply.messageID);
    replyManager.delete(Reply.messageID);
      await sendMessage(api, threadID, "❌ [𝐂𝐀𝐍𝐂𝐄𝐋𝐋𝐄𝐃] ➜ Overwrite cancelled by user.", messageID);
    }
  }
};
