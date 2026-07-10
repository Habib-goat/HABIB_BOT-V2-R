/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

let fse;
try {
  fse = require('fs-extra');
} catch (e) {
  fse = {
    ...fs,
    copy: function (src, dest, cb) {
      try {
        fs.copyFileSync(src, dest);
        if (cb) cb();
      } catch (err) {
        if (cb) cb(err);
      }
    },
    remove: function (dir, cb) {
      try {
        if (fs.rmSync) {
          fs.rmSync(dir, { recursive: true, force: true });
        } else {
          fs.rmdirSync(dir, { recursive: true });
        }
        if (cb) cb();
      } catch (err) {
        if (cb) cb(err);
      }
    }
  };
}

// Global storage for confirmations
if (!global.riyadCmdPendingConfirmations) {
  global.riyadCmdPendingConfirmations = {};
}

// Unicode Bold letters helper
function bold(text) {
  const chars = {
    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠',
    'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺',
    'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝗫', 'y': '𝘆', 'z': '𝘇',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
  };
  return text.split('').map(c => chars[c] || c).join('');
}

// UI Headers
const HEADER = `━━━━━━━━━━━━━━━━━━━━━━\n⚙️ 𝗥𝗶𝘆𝗮𝗱 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 𝗠𝗮𝗻𝗮𝗴𝗲𝗿\n━━━━━━━━━━━━━━━━━━━━━━`;
const FOOTER = `━━━━━━━━━━━━━━━━━━━━━━`;

// Helper to extract config of any command (both active and disabled)
function extractConfig(fileName, dirPath) {
  const filePath = path.join(dirPath, fileName);
  let checkPath = filePath;
  let isTemp = false;
  let config = null;

  if (fileName.endsWith('.disabled')) {
    const tempName = `temp_extract_${Date.now()}_${Math.floor(Math.random() * 1000)}.js`;
    checkPath = path.join(dirPath, tempName);
    try {
      fs.copyFileSync(filePath, checkPath);
      isTemp = true;
    } catch (e) {
      return null;
    }
  }

  try {
    try {
      delete require.cache[require.resolve(checkPath)];
    } catch (e) {}
    const mod = require(checkPath);
    config = mod.config || null;
  } catch (err) {
    // If it threw syntax error or something, read via simple regex fallback
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const nameMatch = fileContent.match(/name\s*:\s*["'`](.*?)["'`]/);
      const authorMatch = fileContent.match(/author\s*:\s*["'`](.*?)["'`]/);
      const descMatch = fileContent.match(/(description|shortDescription)\s*:\s*["'`](.*?)["'`]/);
      
      if (nameMatch) {
        config = {
          name: nameMatch[1],
          author: authorMatch ? authorMatch[1] : 'Unknown',
          description: descMatch ? descMatch[2] : 'No description',
          version: '1.0.0',
          category: 'Uncategorized'
        };
      }
    } catch (innerErr) {}
  } finally {
    if (isTemp) {
      try {
        fs.unlinkSync(checkPath);
        delete require.cache[require.resolve(checkPath)];
      } catch (e) {}
    }
  }

  return config;
}

// Safe reload helper that works with different frameworks
function reloadCmd(commandName, dirPath) {
  const filePath = path.join(dirPath, `${commandName}.js`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Command file not found: ${commandName}.js`);
  }

  try {
    delete require.cache[require.resolve(filePath)];
  } catch (e) {}

  const commandModule = require(filePath);
  if (!commandModule || !commandModule.config) {
    throw new Error(`Command ${commandName}.js has invalid structure or missing config.`);
  }

  let success = false;

  const registries = [
    global.client?.commands,
    global.commands,
    global.GoatBot?.commands,
    global.api?.commands
  ];

  for (const reg of registries) {
    if (reg) {
      if (typeof reg.set === 'function') {
        reg.set(commandModule.config.name || commandName, commandModule);
        success = true;
      } else if (typeof reg === 'object') {
        reg[commandModule.config.name || commandName] = commandModule;
        success = true;
      }
    }
  }

  // Reload aliases
  const aliasesRegistries = [
    global.client?.aliases,
    global.aliases,
    global.GoatBot?.aliases
  ];

  if (commandModule.config.aliases && Array.isArray(commandModule.config.aliases)) {
    for (const reg of aliasesRegistries) {
      if (reg) {
        // Clear previous aliases pointing to this command name
        if (typeof reg.delete === 'function') {
          for (const [k, v] of reg.entries()) {
            if (v === commandName || (v && v.config && v.config.name === commandName)) {
              reg.delete(k);
            }
          }
          for (const alias of commandModule.config.aliases) {
            reg.set(alias, commandModule);
          }
        } else if (typeof reg === 'object') {
          for (const k in reg) {
            if (reg[k] === commandName || (reg[k] && reg[k].config && reg[k].config.name === commandName)) {
              delete reg[k];
            }
          }
          for (const alias of commandModule.config.aliases) {
            reg[alias] = commandModule;
          }
        }
      }
    }
  }

  return { success, config: commandModule.config };
}

module.exports = {
  config: {
    name: "cmd",
    aliases: ["command", "commands", "cmds"],
    version: "1.2.0",
    author: "Riyad",
    credits: "Riyad Bot",
    cooldowns: 5,
    cooldown: 5,
    role: 2,
    permission: 2,
    category: "system",
    description: "Premium Command Manager to install, delete, enable, disable, reload, check info, list, search, count, backup, restore, rename, check and troubleshoot commands.",
    guide: {
      en: "/cmd [list|info|install|delete|enable|disable|reload|search|count|backup|restore|rename|check|doctor]"
    }
  },

  onStart: async function ({ api, event, args, usersData, threadsData }) {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const dirPath = __dirname; // Points to scripts/cmds/

    if (!args || args.length === 0) {
      const helpMsg = `${HEADER}
🤖 𝗔𝘃𝗮𝗶𝗹𝗮𝗯𝗹𝗲 𝗔𝗰𝘁𝗶𝗼𝗻𝘀:

• ${bold("cmd list")} [page]
  👉 List all files with pagination

• ${bold("cmd info")} [command]
  👉 View detailed specs of a command

• ${bold("cmd install")} [file.js] [code]
  👉 Install command file directly

• ${bold("cmd delete")} [command]
  👉 Delete a command safely

• ${bold("cmd enable")} [command]
  👉 Enable a disabled command

• ${bold("cmd disable")} [command]
  👉 Disable a command (offline toggle)

• ${bold("cmd reload")} [command/all]
  👉 Hot reload active files

• ${bold("cmd search")} [keyword]
  👉 Find commands by name or metadata

• ${bold("cmd count")}
  👉 Show dynamic totals

• ${bold("cmd backup")}
  👉 Bundle and export commands

• ${bold("cmd restore")}
  👉 Import from text or local file

• ${bold("cmd rename")} [old] [new]
  👉 Safely rename files on disk

• ${bold("cmd check")}
  👉 Check naming or alias overlap

• ${bold("cmd doctor")}
  👉 Full framework troubleshooting

${FOOTER}
👤 Author: Riyad | Credits: Riyad Bot`;
      return api.sendMessage(helpMsg, threadID, messageID);
    }

    const subCommand = args[0].toLowerCase();

    // 1. LIST COMMANDS
    if (subCommand === 'list') {
      try {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.disabled'));
        if (files.length === 0) {
          return api.sendMessage(`${HEADER}\nNo command files found in scripts/cmds/! 📭\n${FOOTER}`, threadID, messageID);
        }

        files.sort();

        const page = args[1] ? parseInt(args[1]) : 1;
        if (isNaN(page) || page < 1) {
          return api.sendMessage(`${HEADER}\nInvalid page number! ❌\n${FOOTER}`, threadID, messageID);
        }

        const itemsPerPage = 10;
        const totalPages = Math.ceil(files.length / itemsPerPage);

        if (page > totalPages) {
          return api.sendMessage(`${HEADER}\nPage ${page} does not exist. Total pages: ${totalPages} 📁\n${FOOTER}`, threadID, messageID);
        }

        const startIndex = (page - 1) * itemsPerPage;
        const pageItems = files.slice(startIndex, startIndex + itemsPerPage);

        let listMsg = `${HEADER}\n📁 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 𝗟𝗶𝘀𝘁 (Page ${page}/${totalPages}):\n\n`;
        for (let i = 0; i < pageItems.length; i++) {
          const file = pageItems[i];
          const isEnabled = file.endsWith('.js');
          const statusIcon = isEnabled ? '🟢' : '🔴';
          const cleanName = file.replace(/\.js$/, '').replace(/\.disabled$/, '');
          
          // Get config for better presentation if available
          const config = extractConfig(file, dirPath);
          const categoryText = config && config.category ? ` [${config.category}]` : '';
          
          listMsg += `${startIndex + i + 1}. ${statusIcon} ${bold(cleanName)}${categoryText}\n`;
        }

        listMsg += `\nTotal: ${files.length} commands.\nUse: /cmd list [page]\n${FOOTER}`;
        return api.sendMessage(listMsg, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to list directory: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 2. COMMAND INFORMATION
    if (subCommand === 'info') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease provide a command name!\nExample: /cmd info note\n${FOOTER}`, threadID, messageID);
      }

      const cleanName = args[1].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');
      const files = fs.readdirSync(dirPath);
      const targetFile = files.find(f => {
        const checkName = f.replace(/\.js$/, '').replace(/\.disabled$/, '').toLowerCase();
        return checkName === cleanName;
      });

      if (!targetFile) {
        return api.sendMessage(`${HEADER}\nCommand "${cleanName}" not found! 🔎\n${FOOTER}`, threadID, messageID);
      }

      const filePath = path.join(dirPath, targetFile);
      const isEnabled = targetFile.endsWith('.js');
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);

      const config = extractConfig(targetFile, dirPath);

      if (!config) {
        return api.sendMessage(`${HEADER}\nCommand found but failed to read its configuration. File might have syntax errors! ⚠️\n\n• Name: ${targetFile}\n• Size: ${sizeKB} KB\n• Status: ${isEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}\n${FOOTER}`, threadID, messageID);
      }

      const infoMsg = `${HEADER}
📝 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 𝗦𝗽𝗲𝗰𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻𝘀:

• ${bold("Command Name:")} ${config.name || cleanName}
• ${bold("Version:")} ${config.version || '1.0.0'}
• ${bold("Author:")} ${config.author || 'Unknown'}
• ${bold("Credits:")} ${config.credits || 'Riyad Bot'}
• ${bold("Description:")} ${config.description || config.shortDescription || 'No description provided'}
• ${bold("Aliases:")} ${config.aliases && config.aliases.length > 0 ? config.aliases.join(', ') : 'None'}
• ${bold("Category:")} ${config.category || 'Default'}
• ${bold("Cooldown:")} ${config.cooldown || config.cooldowns || 0}s
• ${bold("Permission:")} ${config.permission !== undefined ? config.permission : (config.role !== undefined ? config.role : 'Everyone')}
• ${bold("File Size:")} ${sizeKB} KB
• ${bold("File Path:")} scripts/cmds/${targetFile}
• ${bold("Status:")} ${isEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}

${FOOTER}`;
      return api.sendMessage(infoMsg, threadID, messageID);
    }

    // 3. INSTALL COMMAND
    if (subCommand === 'install') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease specify a command filename to install!\nExample: /cmd install note.js\n${FOOTER}`, threadID, messageID);
      }

      let filename = args[1];
      if (!filename.endsWith('.js')) {
        filename += '.js';
      }

      const targetPath = path.join(dirPath, filename);

      // Check if file already exists
      if (fs.existsSync(targetPath) || fs.existsSync(targetPath + '.disabled')) {
        return api.sendMessage(`${HEADER}\nAlready Installed ✅\n${FOOTER}`, threadID, messageID);
      }

      // Check for code input
      let codeToInstall = "";

      // Case A: Reply to a message with code
      if (event.messageReply && event.messageReply.body) {
        codeToInstall = event.messageReply.body;
      } 
      // Case B: Provided code directly in args
      else if (args.length > 2) {
        codeToInstall = args.slice(2).join(" ");
      }

      if (!codeToInstall) {
        // Create an elegant boilerplate instead of failing completely!
        const cleanName = filename.replace(/\.js$/, '');
        codeToInstall = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  config: {
    name: "${cleanName}",
    version: "1.0.0",
    author: "Riyad",
    credits: "Riyad Bot",
    cooldown: 5,
    permission: 0,
    category: "general",
    description: "Template command created automatically"
  },

  onStart: async function ({ api, event, args }) {
    return api.sendMessage("Hello! This is your newly installed ${cleanName} command! 🚀", event.threadID, event.messageID);
  },

  onChat: async function ({ api, event }) {
    // Optional chat listener
  }
};`;
      }

      try {
        fs.writeFileSync(targetPath, codeToInstall, 'utf8');
        
        // Attempt hot-loading the new command
        let reloadStatus = "";
        try {
          reloadCmd(filename.replace(/\.js$/, ''), dirPath);
          reloadStatus = " (Loaded & active ⚡)";
        } catch (reloadErr) {
          reloadStatus = " (Installed but has load warnings: " + reloadErr.message + ")";
        }

        return api.sendMessage(`${HEADER}\nCommand ${bold(filename)} installed successfully! 🎉${reloadStatus}\n${FOOTER}`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to install command: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 4. DELETE COMMAND
    if (subCommand === 'delete') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease specify a command to delete!\nExample: /cmd delete note\n${FOOTER}`, threadID, messageID);
      }

      const cmdToDelete = args[1].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');

      if (cmdToDelete === 'cmd') {
        return api.sendMessage(`${HEADER}\nDeletion Refused! 🚫\nCannot delete the command manager itself ("cmd.js") for safety reasons!\n${FOOTER}`, threadID, messageID);
      }

      const files = fs.readdirSync(dirPath);
      const fileTarget = files.find(f => {
        const check = f.replace(/\.js$/, '').replace(/\.disabled$/, '').toLowerCase();
        return check === cmdToDelete;
      });

      if (!fileTarget) {
        return api.sendMessage(`${HEADER}\nCommand file "${cmdToDelete}" not found! 🔎\n${FOOTER}`, threadID, messageID);
      }

      const targetPath = path.join(dirPath, fileTarget);

      // Register confirmation
      global.riyadCmdPendingConfirmations[threadID] = {
        action: 'delete',
        target: fileTarget,
        targetPath: targetPath,
        timestamp: Date.now()
      };

      const confirmMsg = `${HEADER}
⚠️  𝗖𝗼𝗻𝗳𝗶𝗿𝗺 𝗗𝗲𝗹𝗲𝘁𝗶𝗼𝗻:

Are you sure you want to delete "${fileTarget}"?
This action is permanent and cannot be undone!

Reply "${bold("yes")}" to confirm, or "${bold("no")}" to cancel.
(Expires in 60 seconds)
${FOOTER}`;
      return api.sendMessage(confirmMsg, threadID, messageID);
    }

    // 5. ENABLE COMMAND
    if (subCommand === 'enable') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease specify a command to enable!\nExample: /cmd enable note\n${FOOTER}`, threadID, messageID);
      }

      const cleanName = args[1].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');
      const files = fs.readdirSync(dirPath);
      const disabledFile = files.find(f => f.toLowerCase() === `${cleanName}.js.disabled` || f.toLowerCase() === `${cleanName}.disabled`);

      if (!disabledFile) {
        if (files.find(f => f.toLowerCase() === `${cleanName}.js`)) {
          return api.sendMessage(`${HEADER}\nCommand "${cleanName}" is already enabled! 🟢\n${FOOTER}`, threadID, messageID);
        }
        return api.sendMessage(`${HEADER}\nCommand file for "${cleanName}" was not found! 🔎\n${FOOTER}`, threadID, messageID);
      }

      const oldPath = path.join(dirPath, disabledFile);
      const newPath = path.join(dirPath, `${cleanName}.js`);

      try {
        fs.renameSync(oldPath, newPath);
        
        let loadMsg = "";
        try {
          reloadCmd(cleanName, dirPath);
          loadMsg = "\nCommand has been successfully loaded into memory! ⚡";
        } catch (loadErr) {
          loadMsg = `\n⚠️ Loaded with warnings: ${loadErr.message}`;
        }

        return api.sendMessage(`${HEADER}\nCommand "${cleanName}" has been enabled! 🟢${loadMsg}\n${FOOTER}`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to enable command: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 6. DISABLE COMMAND
    if (subCommand === 'disable') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease specify a command to disable!\nExample: /cmd disable note\n${FOOTER}`, threadID, messageID);
      }

      const cleanName = args[1].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');

      if (cleanName === 'cmd') {
        return api.sendMessage(`${HEADER}\nSafety Block! 🚫\nYou cannot disable the Command Manager ("cmd.js")!\n${FOOTER}`, threadID, messageID);
      }

      const files = fs.readdirSync(dirPath);
      const enabledFile = files.find(f => f.toLowerCase() === `${cleanName}.js`);

      if (!enabledFile) {
        if (files.find(f => f.toLowerCase() === `${cleanName}.js.disabled` || f.toLowerCase() === `${cleanName}.disabled`)) {
          return api.sendMessage(`${HEADER}\nCommand "${cleanName}" is already disabled! 🔴\n${FOOTER}`, threadID, messageID);
        }
        return api.sendMessage(`${HEADER}\nCommand "${cleanName}" not found! 🔎\n${FOOTER}`, threadID, messageID);
      }

      const oldPath = path.join(dirPath, enabledFile);
      const newPath = path.join(dirPath, `${cleanName}.js.disabled`);

      try {
        // Remove from registries in global memory
        const registries = [
          global.client?.commands,
          global.commands,
          global.GoatBot?.commands,
          global.api?.commands
        ];
        for (const reg of registries) {
          if (reg) {
            if (typeof reg.delete === 'function') reg.delete(cleanName);
            else if (typeof reg === 'object') delete reg[cleanName];
          }
        }

        fs.renameSync(oldPath, newPath);
        return api.sendMessage(`${HEADER}\nCommand "${cleanName}" has been disabled! 🔴\nIt will not load or run until enabled again.\n${FOOTER}`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to disable command: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 7. RELOAD COMMAND
    if (subCommand === 'reload') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease specify a command to reload, or "all"!\nExample: /cmd reload note\n${FOOTER}`, threadID, messageID);
      }

      const target = args[1].toLowerCase();

      if (target === 'all') {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
        let successCount = 0;
        let failCount = 0;
        const failures = [];

        for (const file of files) {
          const cmdName = file.replace(/\.js$/, '');
          try {
            reloadCmd(cmdName, dirPath);
            successCount++;
          } catch (e) {
            failCount++;
            failures.push(`${file}: ${e.message}`);
          }
        }

        let report = `${HEADER}\n⚡ 𝗥𝗲𝗹𝗼𝗮𝗱 𝗔𝗹𝗹 𝗖𝗼𝗺𝗺𝗲𝗻𝘁𝘀:\n\n• Successfully reloaded: ${successCount} commands\n• Failed: ${failCount}`;
        if (failures.length > 0) {
          report += `\n\n⚠️ Failures:\n` + failures.slice(0, 5).map(f => ` - ${f}`).join('\n');
          if (failures.length > 5) report += `\n - and ${failures.length - 5} more...`;
        }
        report += `\n${FOOTER}`;
        return api.sendMessage(report, threadID, messageID);
      } else {
        const cleanName = target.replace(/\.js$/, '').replace(/\.disabled$/, '');
        try {
          const res = reloadCmd(cleanName, dirPath);
          return api.sendMessage(`${HEADER}\nCommand "${cleanName}" reloaded successfully! ⚡\nName: ${res.config.name || cleanName}\nVersion: ${res.config.version || '1.0.0'}\n${FOOTER}`, threadID, messageID);
        } catch (err) {
          return api.sendMessage(`${HEADER}\nFailed to reload command "${cleanName}":\n⚠️ ${err.message}\n${FOOTER}`, threadID, messageID);
        }
      }
    }

    // 8. SEARCH COMMANDS
    if (subCommand === 'search') {
      if (!args[1]) {
        return api.sendMessage(`${HEADER}\nPlease provide a search keyword!\nExample: /cmd search note\n${FOOTER}`, threadID, messageID);
      }

      const keyword = args.slice(1).join(" ").toLowerCase();
      try {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.disabled'));
        const matches = [];

        for (const file of files) {
          const cleanName = file.replace(/\.js$/, '').replace(/\.disabled$/, '');
          const config = extractConfig(file, dirPath);
          
          let score = 0;
          if (cleanName.toLowerCase().includes(keyword)) score += 5;
          
          if (config) {
            if (config.name && config.name.toLowerCase().includes(keyword)) score += 5;
            if (config.description && config.description.toLowerCase().includes(keyword)) score += 3;
            if (config.shortDescription && config.shortDescription.toLowerCase().includes(keyword)) score += 3;
            if (config.aliases && Array.isArray(config.aliases)) {
              if (config.aliases.some(a => a.toLowerCase().includes(keyword))) score += 4;
            }
          }

          if (score > 0) {
            matches.push({ file, cleanName, score, config, isEnabled: file.endsWith('.js') });
          }
        }

        if (matches.length === 0) {
          return api.sendMessage(`${HEADER}\nNo commands found matching: "${keyword}" 🔍\n${FOOTER}`, threadID, messageID);
        }

        matches.sort((a, b) => b.score - a.score);

        let searchMsg = `${HEADER}\n🔍 𝗦𝗲𝗮𝗿𝗰𝗵 𝗥𝗲𝘀𝘂𝗹𝘁𝘀:\n\n`;
        for (let i = 0; i < Math.min(matches.length, 8); i++) {
          const item = matches[i];
          const status = item.isEnabled ? '🟢' : '🔴';
          const desc = item.config?.description || item.config?.shortDescription || 'No description';
          searchMsg += `• ${status} ${bold(item.cleanName)}\n  📝 ${desc.substring(0, 50)}${desc.length > 50 ? '...' : ''}\n\n`;
        }

        if (matches.length > 8) {
          searchMsg += `And ${matches.length - 8} more matches.\n`;
        }
        searchMsg += `${FOOTER}`;
        return api.sendMessage(searchMsg, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nSearch failed: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 9. COUNT COMMANDS
    if (subCommand === 'count') {
      try {
        const files = fs.readdirSync(dirPath);
        const total = files.filter(f => f.endsWith('.js') || f.endsWith('.disabled')).length;
        const enabled = files.filter(f => f.endsWith('.js')).length;
        const disabled = files.filter(f => f.endsWith('.disabled')).length;

        const countMsg = `${HEADER}
📊 𝗦𝘆𝘀𝘁𝗲𝗺 𝗖𝗼𝘂𝗻𝘁𝘀:

• ${bold("Total Commands:")} ${total}
• ${bold("Enabled Commands:")} ${enabled} 🟢
• ${bold("Disabled Commands:")} ${disabled} 🔴

━━━━━━━━━━━━━━━━━━━━━━
Framework Registry Active: Yes
Memory Footprint: Stable 📈
${FOOTER}`;
        return api.sendMessage(countMsg, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to get counts: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 10. BACKUP COMMANDS
    if (subCommand === 'backup') {
      try {
        const backupFileName = 'cmds_backup.json';
        const backupPath = path.join(dirPath, backupFileName);
        const backupData = {
          type: "RiyadBot_Backup",
          timestamp: Date.now(),
          files: {}
        };

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.disabled'));
        for (const file of files) {
          const fPath = path.join(dirPath, file);
          backupData.files[file] = fs.readFileSync(fPath, 'utf8');
        }

        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

        // Create secondary local folder backup for safety as requested
        const localBackupDir = path.join(dirPath, '../../cmds_backup_folder');
        if (!fs.existsSync(localBackupDir)) {
          fs.mkdirSync(localBackupDir, { recursive: true });
        }
        for (const file of files) {
          fs.copyFileSync(path.join(dirPath, file), path.join(localBackupDir, file));
        }

        // Send via Messenger
        api.sendMessage({
          body: `${HEADER}\n📦 𝗕𝗮𝗰𝗸𝘂𝗽 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲𝗱!\n\n• Portable JSON Backup: created successfully ✅\n• Local Folder Backup: "cmds_backup_folder" on disk ✅\n• Total Files Packed: ${files.length}\n\n👉 Reply to this backup file with "/cmd restore" at any time to re-import these scripts!\n${FOOTER}`,
          attachment: fs.createReadStream(backupPath)
        }, threadID, (err) => {
          // Clean up the backup file from our immediate scripts/cmds directory so it doesn't pollute the active list
          try {
            fs.unlinkSync(backupPath);
          } catch (e) {}
        }, messageID);

      } catch (err) {
        return api.sendMessage(`${HEADER}\nBackup failed: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 11. RESTORE COMMANDS
    if (subCommand === 'restore') {
      // Checked if they are replying to an attachment
      if (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {
        const attach = event.messageReply.attachments[0];
        if (attach.url) {
          api.sendMessage(`${HEADER}\nDownloading backup attachment... 📥\n${FOOTER}`, threadID, messageID);
          
          const tempBackupPath = path.join(dirPath, `temp_restore_${Date.now()}.json`);
          const fileStream = fs.createWriteStream(tempBackupPath);
          const httpLib = attach.url.startsWith('https') ? require('https') : require('http');

          httpLib.get(attach.url, function(response) {
            response.pipe(fileStream);
            fileStream.on('finish', function() {
              fileStream.close(async () => {
                try {
                  const content = fs.readFileSync(tempBackupPath, 'utf8');
                  const data = JSON.parse(content);
                  
                  if (data.type !== "RiyadBot_Backup" || !data.files) {
                    api.sendMessage(`${HEADER}\nInvalid backup format! File must be a premium Riyad Command Manager backup. ❌\n${FOOTER}`, threadID, messageID);
                    fs.unlinkSync(tempBackupPath);
                    return;
                  }

                  let count = 0;
                  for (const [fname, fcontent] of Object.entries(data.files)) {
                    const safeName = path.basename(fname);
                    fs.writeFileSync(path.join(dirPath, safeName), fcontent, 'utf8');
                    // Attempt to load if it's active JS
                    if (safeName.endsWith('.js')) {
                      try { reloadCmd(safeName.replace(/\.js$/, ''), dirPath); } catch(e) {}
                    }
                    count++;
                  }

                  api.sendMessage(`${HEADER}\nRestore Successful! 🎉\nSuccessfully imported ${count} commands into scripts/cmds/.\n${FOOTER}`, threadID, messageID);
                  fs.unlinkSync(tempBackupPath);
                } catch (err) {
                  api.sendMessage(`${HEADER}\nFailed to restore JSON content: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
                  try { fs.unlinkSync(tempBackupPath); } catch(e) {}
                }
              });
            });
          }).on('error', function(err) {
            fs.unlinkSync(tempBackupPath);
            api.sendMessage(`${HEADER}\nFailed to download attachment: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
          });
          return;
        }
      }

      // Local disk restore fallbacks
      const localBackupDir = path.join(dirPath, '../../cmds_backup_folder');
      if (fs.existsSync(localBackupDir)) {
        try {
          const files = fs.readdirSync(localBackupDir);
          let count = 0;
          for (const file of files) {
            if (file.endsWith('.js') || file.endsWith('.disabled')) {
              fs.copyFileSync(path.join(localBackupDir, file), path.join(dirPath, file));
              if (file.endsWith('.js')) {
                try { reloadCmd(file.replace(/\.js$/, ''), dirPath); } catch(e) {}
              }
              count++;
            }
          }
          return api.sendMessage(`${HEADER}\nLocal Restore Successful! 📁\nSuccessfully imported ${count} commands from disk backup directory.\n${FOOTER}`, threadID, messageID);
        } catch (err) {
          return api.sendMessage(`${HEADER}\nFailed to restore from local directory: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
        }
      }

      return api.sendMessage(`${HEADER}\nNo restore source detected! ❌\n\n👉 Reply to a command backup file with "/cmd restore" or verify "cmds_backup_folder" exists in your project workspace.\n${FOOTER}`, threadID, messageID);
    }

    // 12. RENAME COMMAND
    if (subCommand === 'rename') {
      if (!args[1] || !args[2]) {
        return api.sendMessage(`${HEADER}\nIncorrect arguments!\nExample: /cmd rename oldname newname\n${FOOTER}`, threadID, messageID);
      }

      const oldName = args[1].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');
      const newName = args[2].toLowerCase().replace(/\.js$/, '').replace(/\.disabled$/, '');

      if (oldName === 'cmd') {
        return api.sendMessage(`${HEADER}\nSafety Block! 🚫\nCannot rename the Command Manager itself.\n${FOOTER}`, threadID, messageID);
      }

      const files = fs.readdirSync(dirPath);
      const targetFile = files.find(f => f.replace(/\.js$/, '').replace(/\.disabled$/, '').toLowerCase() === oldName);

      if (!targetFile) {
        return api.sendMessage(`${HEADER}\nSource file "${oldName}" not found! 🔍\n${FOOTER}`, threadID, messageID);
      }

      const isEnabled = targetFile.endsWith('.js');
      const suffix = isEnabled ? '.js' : '.js.disabled';
      const oldPath = path.join(dirPath, targetFile);
      const newPath = path.join(dirPath, newName + suffix);

      if (fs.existsSync(newPath)) {
        return api.sendMessage(`${HEADER}\nDestination filename "${newName}${suffix}" already exists! ⚠️\n${FOOTER}`, threadID, messageID);
      }

      try {
        // Remove old name from registries
        const registries = [
          global.client?.commands,
          global.commands,
          global.GoatBot?.commands,
          global.api?.commands
        ];
        for (const reg of registries) {
          if (reg) {
            if (typeof reg.delete === 'function') reg.delete(oldName);
            else if (typeof reg === 'object') delete reg[oldName];
          }
        }

        fs.renameSync(oldPath, newPath);

        let hotLoadMsg = "";
        if (isEnabled) {
          try {
            reloadCmd(newName, dirPath);
            hotLoadMsg = "\nSuccessfully loaded re-named command! ⚡";
          } catch (err) {
            hotLoadMsg = `\n⚠️ Rename successful but failed to load: ${err.message}`;
          }
        }

        return api.sendMessage(`${HEADER}\nSuccessfully renamed command:\n• ${oldName} ➔ ${bold(newName)}${hotLoadMsg}\n${FOOTER}`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nFailed to rename command: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 13. DUPLICATE CHECK
    if (subCommand === 'check') {
      try {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.disabled'));
        const nameMap = {};
        const aliasMap = {};
        const conflicts = [];

        for (const file of files) {
          const cleanName = file.replace(/\.js$/, '').replace(/\.disabled$/, '');
          const config = extractConfig(file, dirPath);

          if (config && config.name) {
            const name = config.name.toLowerCase();
            if (!nameMap[name]) nameMap[name] = [];
            nameMap[name].push(file);

            if (config.aliases && Array.isArray(config.aliases)) {
              for (const alias of config.aliases) {
                const al = alias.toLowerCase();
                if (!aliasMap[al]) aliasMap[al] = [];
                aliasMap[al].push(file);
              }
            }
          }
        }

        for (const [name, filesWithThisName] of Object.entries(nameMap)) {
          if (filesWithThisName.length > 1) {
            conflicts.push(`• ${bold("Duplicate Name:")} "${name}" used in: ${filesWithThisName.join(', ')}`);
          }
          if (aliasMap[name]) {
            conflicts.push(`• ${bold("Name & Alias Clashing:")} Name "${name}" in ${filesWithThisName.join(', ')} is also registered as an alias in ${aliasMap[name].join(', ')}`);
          }
        }

        for (const [alias, filesWithThisAlias] of Object.entries(aliasMap)) {
          if (filesWithThisAlias.length > 1) {
            conflicts.push(`• ${bold("Duplicate Alias:")} "${alias}" registered in: ${filesWithThisAlias.join(', ')}`);
          }
        }

        if (conflicts.length === 0) {
          return api.sendMessage(`${HEADER}\nNo command conflicts or naming collisions detected! All healthy! 🟢\n${FOOTER}`, threadID, messageID);
        }

        let report = `${HEADER}\n⚠️ 𝗖𝗼𝗻𝗳𝗹𝗶𝗰𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀:\n\n` + conflicts.join('\n\n') + `\n\n👉 Resolve these collisions to prevent execution bugs!\n${FOOTER}`;
        return api.sendMessage(report, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nConflict check failed: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // 14. HEALTH CHECK / DOCTOR
    if (subCommand === 'doctor') {
      try {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js') || f.endsWith('.disabled'));
        let syntaxErrors = 0;
        let configErrors = 0;
        let handlerErrors = 0;
        let warningsCount = 0;
        const reports = [];

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          let loaded = null;
          let syntaxErr = null;
          let isTemp = false;
          let checkPath = filePath;

          if (file.endsWith('.disabled')) {
            const tempName = `temp_doctor_load_${Date.now()}_${Math.floor(Math.random() * 1000)}.js`;
            checkPath = path.join(dirPath, tempName);
            try {
              fs.copyFileSync(filePath, checkPath);
              isTemp = true;
            } catch (e) {
              syntaxErr = "Temporary copy creation failed";
            }
          }

          if (!syntaxErr) {
            try {
              try { delete require.cache[require.resolve(checkPath)]; } catch (e) {}
              loaded = require(checkPath);
            } catch (err) {
              syntaxErr = err.message;
            } finally {
              if (isTemp) {
                try {
                  fs.unlinkSync(checkPath);
                  delete require.cache[require.resolve(checkPath)];
                } catch (e) {}
              }
            }
          }

          const rep = {
            file,
            status: 'Healthy ✅',
            messages: []
          };

          if (syntaxErr) {
            syntaxErrors++;
            rep.status = 'Syntax Error ❌';
            rep.messages.push(`Syntax Fail: ${syntaxErr}`);
          } else if (!loaded || typeof loaded !== 'object') {
            configErrors++;
            rep.status = 'Invalid Exports ❌';
            rep.messages.push('Does not export a valid module object');
          } else {
            const config = loaded.config;
            if (!config) {
              configErrors++;
              rep.status = 'Config Error ❌';
              rep.messages.push('Missing "config" export object');
            } else {
              if (!config.name) {
                configErrors++;
                rep.status = 'Config Error ❌';
                rep.messages.push('Missing "config.name" property');
              }
            }

            if (!loaded.onStart) {
              handlerErrors++;
              rep.status = 'Missing Handlers ❌';
              rep.messages.push('Missing "onStart" hook function');
            } else if (typeof loaded.onStart !== 'function') {
              handlerErrors++;
              rep.status = 'Invalid Handlers ❌';
              rep.messages.push('"onStart" hook is not a valid function');
            }

            if (!loaded.onChat) {
              warningsCount++;
              rep.messages.push('(Optional) No "onChat" hook defined');
            }
          }

          reports.push(rep);
        }

        let reportMsg = `${HEADER}\n🩺 𝗗𝗼𝗰𝘁𝗼𝗿 𝗗𝗶𝗮𝗴𝗻𝗼𝘀𝘁𝗶𝗰 𝗥𝗲𝗽𝗼𝗿𝘁:\n\n`;
        reportMsg += `• Total Files: ${files.length}\n`;
        reportMsg += `• Syntax Faults: ${syntaxErrors} ❌\n`;
        reportMsg += `• Schema Faults: ${configErrors} ⚠️\n`;
        reportMsg += `• Missing Handlers: ${handlerErrors} 🚫\n`;
        reportMsg += `• Optional Warnings: ${warningsCount} 💡\n\n`;

        // Highlight problematic ones
        const issues = reports.filter(r => r.status !== 'Healthy ✅');
        if (issues.length === 0) {
          reportMsg += `🎉 All commands are extremely healthy, valid, and production-ready!\n`;
        } else {
          reportMsg += `⚠️ 𝗙𝗶𝗹𝗲𝘀 𝗥𝗲𝗾𝘂𝗶𝗿𝗶𝗻𝗴 𝗔𝘁𝘁𝗲𝗻𝘁𝗶𝗼𝗻:\n`;
          for (const iss of issues.slice(0, 5)) {
            reportMsg += ` - ${bold(iss.file)} (${iss.status})\n   ↳ ${iss.messages[0]}\n`;
          }
          if (issues.length > 5) {
            reportMsg += ` - and ${issues.length - 5} more issues.`;
          }
        }

        reportMsg += `\n${FOOTER}`;
        return api.sendMessage(reportMsg, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`${HEADER}\nDoctor inspection failed: ${err.message} ❌\n${FOOTER}`, threadID, messageID);
      }
    }

    // Default Fallback
    return api.sendMessage(`${HEADER}\nUnknown manager sub-command! Type "/cmd" to view help menu. ⚠️\n${FOOTER}`, threadID, messageID);
  },

  onChat: async function ({ api, event, usersData, threadsData }) {
    if (!event || !event.body || !event.threadID) return;
    const threadID = event.threadID;
    const pending = global.riyadCmdPendingConfirmations[threadID];

    if (pending) {
      // Check for timeout
      if (Date.now() - pending.timestamp > 60000) {
        delete global.riyadCmdPendingConfirmations[threadID];
        return;
      }

      const replyText = event.body.trim().toLowerCase();
      if (replyText === 'yes' || replyText === 'y') {
        if (pending.action === 'delete') {
          try {
            if (fs.existsSync(pending.targetPath)) {
              fs.unlinkSync(pending.targetPath);
              
              // Unregister from registries
              const cleanName = pending.target.replace(/\.js$/, '').replace(/\.disabled$/, '');
              const registries = [
                global.client?.commands,
                global.commands,
                global.GoatBot?.commands,
                global.api?.commands
              ];
              for (const reg of registries) {
                if (reg) {
                  if (typeof reg.delete === 'function') reg.delete(cleanName);
                  else if (typeof reg === 'object') delete reg[cleanName];
                }
              }

              api.sendMessage(`${HEADER}\nSuccessfully deleted command "${pending.target}" from your system! 🗑️\n${FOOTER}`, threadID, event.messageID);
            } else {
              api.sendMessage(`${HEADER}\nFile does not exist: "${pending.target}"! ❌\n${FOOTER}`, threadID, event.messageID);
            }
          } catch (err) {
            api.sendMessage(`${HEADER}\nFailed to delete file: ${err.message} ❌\n${FOOTER}`, threadID, event.messageID);
          }
        }
        delete global.riyadCmdPendingConfirmations[threadID];
      } else if (replyText === 'no' || replyText === 'n' || replyText === 'cancel') {
        api.sendMessage(`${HEADER}\nAction cancelled! Deletion aborted. ✅\n${FOOTER}`, threadID, event.messageID);
        delete global.riyadCmdPendingConfirmations[threadID];
      }
    }
  }
};