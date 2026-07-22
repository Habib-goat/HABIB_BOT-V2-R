const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm');
const commandLoader = require("../handlers/commandLoader");

const BASE_URL = 'https://riyad-store-api.onrender.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Perform API request with automatic retry on failure
 */
async function fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, { timeout: 10000, ...options });
        } catch (err) {
            if (i === retries) throw err;
            await sleep(1000);
        }
    }
}

/**
 * Handle API & FS error messages cleanly
 */
function getErrorMessage(error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return "❌ Request timed out. Please try again later.";
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return "❌ Riyad Store API is unavailable.";
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
        return "❌ Permission denied. Unable to write command file.";
    }
    if (error.code === 'ENOSPC') {
        return "❌ Disk write error: Storage full.";
    }
    if (error.response) {
        if (error.response.status === 404) return "❌ Command not found.";
        return `❌ Server error (${error.response.status}).`;
    }
    return "❌ Network error or Riyad Store API is unavailable.";
}

/**
 * Extract target message ID from api.reply response
 */
function getMsgID(sent) {
    if (!sent) return null;
    if (typeof sent === 'string' || typeof sent === 'number') return sent;
    return sent.messageID || sent.message_id || sent.mid || null;
}

/**
 * Edit progress message safely
 */
async function editProgress(api, msgID, text, event) {
    try {
        if (msgID) {
            await api.editMessage(msgID, text);
        } else {
            await api.reply(text, event);
        }
    } catch (e) {
        try {
            await api.reply(text, event);
        } catch (err) {}
    }
}

/**
 * Detect command name from code or metadata
 */
function extractCommandName(rawCode, metaName, cmdId) {
    if (rawCode && typeof rawCode === 'string') {
        const patterns = [
            /name\s*:\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i,
            /name\s*=\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i
        ];
        for (const pattern of patterns) {
            const match = rawCode.match(pattern);
            if (match && match[1]) return match[1].trim();
        }
    }
    if (metaName && typeof metaName === 'string') {
        const sanitized = metaName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (sanitized.length > 0) return sanitized;
    }
    return `cmd_${cmdId}`;
}

/**
 * Validate command JS syntax and structure
 */
function validateCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string' || rawCode.trim().length === 0) {
        return { valid: false, reason: "Downloaded code is empty." };
    }
    try {
        new vm.Script(rawCode);
    } catch (err) {
        return { valid: false, reason: `Syntax Error: ${err.message}` };
    }
    const hasExport = /module\.exports|exports\./i.test(rawCode);
    if (!hasExport) return { valid: false, reason: "Missing module.exports." };

    const hasConfig = /config\s*:\s*\{|config\s*=/i.test(rawCode);
    if (!hasConfig) return { valid: false, reason: "Missing config object." };

    const hasName = /name\s*:\s*["'`][a-zA-Z0-9_-]+["'`]/i.test(rawCode);
    if (!hasName) return { valid: false, reason: "Missing config.name." };

    return { valid: true };
}

/**
 * Reload command in Riyad Bot Framework
 */
async function reloadCommand(cmdName) {
    try {
        commandLoader.reloadCommand(cmdName);
        return true;
    } catch (err) {
        console.error("Reload failed:", err);
        return false;
    }
}

/**
 * Generate formatted progress box frame
 */
function renderAnimFrame(percent) {
    const totalBars = 10;
    const filled = Math.round((percent / 100) * totalBars);
    const empty = totalBars - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const paddedPercent = `${percent}%`.padEnd(4, ' ');

    return `╭───────────────╮
│ 📦 Riyad Store │
├───────────────┤
│ ${bar} ${paddedPercent}│
╰───────────────╯`;
}

module.exports = {
    config: {
        name: "rs",
        aliases: ["store", "riyadstore"],
        version: "1.2.0",
        author: "Riyad",
        countDown: 5,
        role: 0,
        description: "Access Riyad Store to search, view, install, update, and uninstall commands",
        category: "store",
        guide: {
            en: "Commands:\n" +
                "/rs - Show help menu\n" +
                "/rs list - List available commands\n" +
                "/rs search <keyword> - Search commands\n" +
                "/rs info <id> - View command details\n" +
                "/rs install <id> - Install a command\n" +
                "/rs update <id> - Update a command\n" +
                "/rs uninstall <name|id> - Uninstall a command\n" +
                "/rs featured - View featured commands\n" +
                "/rs latest - View latest commands"
        }
    },

    onStart: async function ({ api, event, args, usersData, threadsData, replyManager, reactionManager }) {
        const subCommand = (args[0] || '').toLowerCase();

        switch (subCommand) {
            case 'list': {
                try {
                    const res = await fetchWithRetry(`${BASE_URL}/api/store/list`);
                    const items = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    if (!items || items.length === 0) {
                        return await api.reply("❌ No commands available in Riyad Store.", event);
                    }

                    let listText = "📦 𝗥𝗜𝗬𝗔𝗗 𝗦𝗧𝗢𝗥𝗘 - 𝗔𝗩𝗔𝗜𝗟𝗔𝗕𝗟𝗘 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n━━━━━━━━━━━━━━━━━━\n\n";
                    items.forEach((item, idx) => {
                        listText += `${idx + 1}. [ID: ${item.id || item._id || 'N/A'}] 📦 ${item.name || 'Unnamed'}\n`;
                        if (item.version) listText += `   🔖 Version: ${item.version}\n`;
                        if (item.author) listText += `   👤 Author: ${item.author}\n`;
                        if (item.category) listText += `   📂 Category: ${item.category}\n`;
                        if (item.description) listText += `   📝 ${item.description}\n`;
                        listText += "\n";
                    });

                    listText += "━━━━━━━━━━━━━━━━━━\n💡 Use /rs info <id> to view details\n💡 Use /rs install <id> to install a command";
                    return await api.reply(listText, event);
                } catch (error) {
                    return await api.reply(getErrorMessage(error), event);
                }
            }

            case 'search': {
                const query = args.slice(1).join(" ").trim();
                if (!query) {
                    return await api.reply("❌ Please provide a search keyword.\nExample: /rs search ai", event);
                }

                try {
                    const res = await fetchWithRetry(`${BASE_URL}/api/store/search`, { params: { q: query } });
                    const items = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    if (!items || items.length === 0) {
                        return await api.reply(`❌ No commands found matching "${query}".`, event);
                    }

                    let searchText = `📦 𝗥𝗜𝗬𝗔𝗗 𝗦𝗧𝗢𝗥𝗘 - 𝗦𝗘𝗔𝗥𝗖𝗛 𝗥𝗘𝗦𝗨𝗟𝗧𝗦 ("${query}")\n━━━━━━━━━━━━━━━━━━\n\n`;
                    items.forEach((item, idx) => {
                        searchText += `${idx + 1}. [ID: ${item.id || item._id || 'N/A'}] 📦 ${item.name || 'Unnamed'}\n`;
                        if (item.version) searchText += `   🔖 Version: ${item.version}\n`;
                        if (item.author) searchText += `   👤 Author: ${item.author}\n`;
                        if (item.category) searchText += `   📂 Category: ${item.category}\n`;
                        if (item.description) searchText += `   📝 ${item.description}\n`;
                        searchText += "\n";
                    });

                    searchText += "━━━━━━━━━━━━━━━━━━\n💡 Use /rs install <id> to install a command";
                    return await api.reply(searchText, event);
                } catch (error) {
                    return await api.reply(getErrorMessage(error), event);
                }
            }

            case 'info': {
                const cmdId = args[1];
                if (!cmdId) {
                    return await api.reply("❌ Please provide a command ID.\nExample: /rs info 15", event);
                }

                try {
                    const res = await fetchWithRetry(`${BASE_URL}/api/store/info/${cmdId}`);
                    const item = res.data?.data || res.data?.result || res.data;

                    if (!item || (!item.name && !item.id)) {
                        return await api.reply("❌ Command not found.", event);
                    }

                    const infoText = `📦 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡
━━━━━━━━━━━━━━━━━━
🆔 ID: ${item.id || cmdId}
📦 Name: ${item.name || 'N/A'}
👤 Author: ${item.author || 'Unknown'}
📂 Category: ${item.category || 'General'}
🔖 Version: ${item.version || '1.0.0'}
📝 Description: ${item.description || 'No description provided.'}
━━━━━━━━━━━━━━━━━━
💡 Use /rs install ${item.id || cmdId} to install this command`;

                    return await api.reply(infoText, event);
                } catch (error) {
                    return await api.reply(getErrorMessage(error), event);
                }
            }

            case 'featured': {
                try {
                    const res = await fetchWithRetry(`${BASE_URL}/api/store/list`);
                    const allItems = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);
                    
                    const featuredItems = allItems.filter(item => item.featured || item.isFeatured);
                    const displayItems = featuredItems.length > 0 ? featuredItems : allItems.slice(0, 5);

                    if (!displayItems || displayItems.length === 0) {
                        return await api.reply("❌ No featured commands available right now.", event);
                    }

                    let featuredText = "🌟 𝗥𝗜𝗬𝗔𝗗 𝗦𝗧𝗢𝗥𝗘 - 𝗙𝗘𝗔𝗧𝗨𝗥𝗘𝗗 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n━━━━━━━━━━━━━━━━━━\n\n";
                    displayItems.forEach((item, idx) => {
                        featuredText += `${idx + 1}. [ID: ${item.id || item._id || 'N/A'}] 📦 ${item.name || 'Unnamed'}\n`;
                        if (item.version) featuredText += `   🔖 Version: ${item.version}\n`;
                        if (item.author) featuredText += `   👤 Author: ${item.author}\n`;
                        if (item.category) featuredText += `   📂 Category: ${item.category}\n`;
                        if (item.description) featuredText += `   📝 ${item.description}\n`;
                        featuredText += "\n";
                    });

                    featuredText += "━━━━━━━━━━━━━━━━━━\n💡 Use /rs install <id> to install a command";
                    return await api.reply(featuredText, event);
                } catch (error) {
                    return await api.reply(getErrorMessage(error), event);
                }
            }

            case 'latest': {
                try {
                    const res = await fetchWithRetry(`${BASE_URL}/api/store/list`);
                    const allItems = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    const sortedItems = [...allItems].sort((a, b) => {
                        const idA = parseInt(a.id || 0, 10);
                        const idB = parseInt(b.id || 0, 10);
                        return idB - idA;
                    });
                    const latestItems = sortedItems.slice(0, 10);

                    if (!latestItems || latestItems.length === 0) {
                        return await api.reply("❌ No latest commands available.", event);
                    }

                    let latestText = "🔥 𝗥𝗜𝗬𝗔𝗗 𝗦𝗧𝗢𝗥𝗘 - 𝗟𝗔𝗧𝗘𝗦𝗧 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n━━━━━━━━━━━━━━━━━━\n\n";
                    latestItems.forEach((item, idx) => {
                        latestText += `${idx + 1}. [ID: ${item.id || item._id || 'N/A'}] 📦 ${item.name || 'Unnamed'}\n`;
                        if (item.version) latestText += `   🔖 Version: ${item.version}\n`;
                        if (item.author) latestText += `   👤 Author: ${item.author}\n`;
                        if (item.category) latestText += `   📂 Category: ${item.category}\n`;
                        if (item.description) latestText += `   📝 ${item.description}\n`;
                        latestText += "\n";
                    });

                    latestText += "━━━━━━━━━━━━━━━━━━\n💡 Use /rs install <id> to install a command";
                    return await api.reply(latestText, event);
                } catch (error) {
                    return await api.reply(getErrorMessage(error), event);
                }
            }

            case 'install':
            case 'update': {
                const cmdId = args[1];
                if (!cmdId) {
                    return await api.reply(`❌ Please provide a command ID.\nExample: /rs ${subCommand} 15`, event);
                }

                // Initial animation message (0%)
                const sentMsg = await api.reply(renderAnimFrame(0), event);
                const msgID = getMsgID(sentMsg);

                // Animation Step: 10%
                await sleep(250);
                await editProgress(api, msgID, renderAnimFrame(10), event);

                let rawCode = "";
                let metaInfo = { name: null, author: "Unknown", category: "General", version: "1.0.0" };

                // Download Code
                try {
                    const rawRes = await fetchWithRetry(`${BASE_URL}/api/store/raw/${cmdId}`);
                    if (typeof rawRes.data === 'string') {
                        rawCode = rawRes.data;
                    } else if (rawRes.data && typeof rawRes.data.rawCode === 'string') {
                        rawCode = rawRes.data.rawCode;
                    } else if (rawRes.data && typeof rawRes.data.code === 'string') {
                        rawCode = rawRes.data.code;
                    } else if (rawRes.data && typeof rawRes.data.data === 'string') {
                        rawCode = rawRes.data.data;
                    }
                } catch (error) {
                    return await editProgress(api, msgID, getErrorMessage(error), event);
                }

                // Animation Step: 20%
                await sleep(200);
                await editProgress(api, msgID, renderAnimFrame(20), event);

                if (!rawCode || rawCode.trim().length === 0) {
                    return await editProgress(api, msgID, "❌ Command not found.", event);
                }

                // Metadata Fetch
                try {
                    const infoRes = await fetchWithRetry(`${BASE_URL}/api/store/info/${cmdId}`, {}, 1);
                    const infoData = infoRes.data?.data || infoRes.data?.result || infoRes.data;
                    if (infoData && typeof infoData === 'object') {
                        if (infoData.name) metaInfo.name = infoData.name;
                        if (infoData.author) metaInfo.author = infoData.author;
                        if (infoData.category) metaInfo.category = infoData.category;
                        if (infoData.version) metaInfo.version = infoData.version;
                    }
                } catch (e) {}

                // Command Name & Target Path
                const finalCmdName = extractCommandName(rawCode, metaInfo.name, cmdId);
                const fileName = finalCmdName.endsWith('.js') ? finalCmdName : `${finalCmdName}.js`;
                const targetPath = path.join(process.cwd(), 'scripts', 'cmds', fileName);

                // Duplicate Check on Install
                if (subCommand === 'install') {
                    if (await fs.pathExists(targetPath)) {
                        return await editProgress(api, msgID, `⚠️ Command already exists.\n\nUse /rs update ${cmdId} to update this command.`, event);
                    }
                }

                // Validate JS Code
                const validation = validateCode(rawCode);
                if (!validation.valid) {
                    return await editProgress(api, msgID, `❌ Invalid command file.\nReason: ${validation.reason}`, event);
                }

                // Animation Step: 40%
                await sleep(250);
                await editProgress(api, msgID, renderAnimFrame(40), event);

                // Animation Step: 60%
                await sleep(250);
                await editProgress(api, msgID, renderAnimFrame(60), event);

                // Save to Disk
                try {
                    await fs.ensureDir(path.dirname(targetPath));
                    await fs.writeFile(targetPath, rawCode, 'utf8');
                } catch (writeErr) {
                    return await editProgress(api, msgID, getErrorMessage(writeErr), event);
                }

                // Animation Step: 80%
                await sleep(250);
                await editProgress(api, msgID, renderAnimFrame(80), event);

                // Load new command if not already loaded
if (subCommand === "install") {
    commandLoader.loadCommand(targetPath);
} else {
    await reloadCommand(finalCmdName);
}

                // Animation Step: 100%
                await sleep(250);
                await editProgress(api, msgID, renderAnimFrame(100), event);

                // Final Completion Status
                await sleep(300);
                await editProgress(api, msgID, "✅ Installation Completed Successfully", event);

                // Verify file exists on disk
                try {
                    const exists = await fs.pathExists(targetPath);
                    if (!exists) return await api.reply("❌ Unable to save command.", event);
                } catch (err) {
                    return await api.reply(getErrorMessage(err), event);
                }

                // React Success
                try {
                    if (typeof api.react === 'function' && event.messageID) {
                        await api.react("✅", event.messageID);
                    }
                } catch (e) {}

                // Success Message Summary
                const successSummary = `✅ Command ${subCommand === 'update' ? 'Updated' : 'Installed'} Successfully

📦 Name: ${finalCmdName}
👤 Author: ${metaInfo.author}
📂 Category: ${metaInfo.category}
🔖 Version: ${metaInfo.version}
🆔 ID: ${cmdId}

━━━━━━━━━━━━━━━━━━

Enjoy using Riyad Store ❤️`;

                return await api.reply(successSummary, event);
            }

            case 'uninstall': {
                const targetName = args[1];
                if (!targetName) {
                    return await api.reply("❌ Please provide a command name or ID to uninstall.\nExample: /rs uninstall mycmd", event);
                }

                const fileName = targetName.endsWith('.js') ? targetName : `${targetName}.js`;
                const targetPath = path.join(process.cwd(), 'scripts', 'cmds', fileName);

                try {
                    const exists = await fs.pathExists(targetPath);
                    if (!exists) {
                        return await api.reply(`❌ Command "${targetName}" is not installed.`, event);
                    }

                    await fs.remove(targetPath);

                    // Clear require cache & reload
                    const resolvedPath = path.resolve(targetPath);
                    if (require.cache[resolvedPath]) {
                        delete require.cache[resolvedPath];
                    }
                    commandLoader.commands.delete(targetName.replace(/\.js$/, "").toLowerCase());

for (const [alias, cmd] of commandLoader.aliases.entries()) {
    if (cmd === targetName.replace(/\.js$/, "").toLowerCase()) {
        commandLoader.aliases.delete(alias);
    }
}

                    try {
                        if (typeof api.react === 'function' && event.messageID) {
                            await api.react("✅", event.messageID);
                        }
                    } catch (e) {}

                    return await api.reply(`✅ Command "${targetName}" uninstalled successfully.`, event);
                } catch (err) {
                    return await api.reply(getErrorMessage(err), event);
                }
            }

            default: {
                const helpText = `📦 𝗥𝗜𝗬𝗔𝗗 𝗦𝗧𝗢𝗥𝗘 - 𝗛𝗘𝗟𝗣 𝗠𝗘𝗡𝗨
━━━━━━━━━━━━━━━━━━
/rs list
  └ Show all available commands

/rs search <keyword>
  └ Search commands by keyword

/rs info <id>
  └ View detailed information of a command

/rs install <id>
  └ Install command directly into bot

/rs update <id>
  └ Update installed command to latest version

/rs uninstall <name>
  └ Uninstall a command from bot

/rs featured
  └ View featured store commands

/rs latest
  └ View latest uploaded commands
━━━━━━━━━━━━━━━━━━
Usage: /rs <subcommand> [args]`;

                return await api.reply(helpText, event);
            }
        }
    }
};
