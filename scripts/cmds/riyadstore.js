const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm');

const BASE_URL = 'https://riyad-store-api.onrender.com';

/**
 * Helper to pause execution for a given duration.
 * @param {number} ms Milliseconds to sleep.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper to reply to a message across different bot framework implementations.
 */
async function replyMsg(api, event, message, text) {
    try {
        if (message && typeof message.reply === 'function') {
            return await message.reply(text);
        }
        if (message && typeof message.send === 'function') {
            return await message.send(text);
        }
        if (api && typeof api.sendMessage === 'function' && event && event.threadID) {
            return new Promise((resolve) => {
                api.sendMessage(text, event.threadID, (err, info) => {
                    resolve(info || null);
                }, event.messageID);
            });
        }
    } catch (err) {
        console.error('[RiyadStore] Error sending message:', err.message);
    }
    return null;
}

/**
 * Helper to edit a previously sent message with graceful fallback if unsupported or failing.
 */
async function editMsg(api, event, message, targetMsg, newText) {
    if (!targetMsg) {
        return await replyMsg(api, event, message, newText);
    }
    const msgID = targetMsg.messageID || targetMsg.message_id || targetMsg;
    try {
        if (message && typeof message.edit === 'function') {
            return await message.edit(newText, msgID);
        }
        if (api && typeof api.editMessage === 'function') {
            return await api.editMessage(newText, msgID);
        }
        if (api && typeof api.sendMessage === 'function' && event && event.threadID) {
            return await replyMsg(api, event, message, newText);
        }
    } catch (err) {
        try {
            return await replyMsg(api, event, message, newText);
        } catch (e) {
            // Ignore fallback send error
        }
    }
    return targetMsg;
}

/**
 * Helper to format clean, readable error messages for all edge cases.
 */
function handleApiOrFsError(error) {
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
        const status = error.response.status;
        if (status === 404) return "❌ Command not found.";
        if (status >= 500) return "❌ Unknown server error.";
        return `❌ Server error (${status}).`;
    }
    if (error.message && error.message.startsWith('❌')) {
        return error.message;
    }
    return "❌ Riyad Store API is unavailable.";
}

/**
 * Safely detect the commands directory.
 */
function getCommandsDir() {
    const candidates = [
        path.join(process.cwd(), 'scripts', 'cmds'),
        path.join(process.cwd(), 'modules', 'commands'),
        path.join(process.cwd(), 'commands'),
        path.join(process.cwd(), 'cmds')
    ];
    for (const dir of candidates) {
        if (fs.existsSync(dir)) {
            return dir;
        }
    }
    return path.join(process.cwd(), 'scripts', 'cmds');
}

/**
 * Detect command name from raw JS code or API metadata.
 */
function detectCommandName(rawCode, metaInfoName, cmdId) {
    if (rawCode && typeof rawCode === 'string') {
        const patterns = [
            /name\s*:\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i,
            /name\s*=\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i,
            /config\s*=\s*\{\s*name\s*:\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i,
            /exports\.config\s*=\s*\{\s*name\s*:\s*["'`]\s*([a-zA-Z0-9_-]+)\s*["'`]/i
        ];
        for (const pattern of patterns) {
            const match = rawCode.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
    }

    if (metaInfoName && typeof metaInfoName === 'string') {
        const sanitized = metaInfoName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (sanitized.length > 0) return sanitized;
    }

    return `cmd_${cmdId}`;
}

/**
 * Validate downloaded code before writing to disk.
 */
function validateCommandCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string' || rawCode.trim().length === 0) {
        return { valid: false, reason: "Empty response from server." };
    }

    // 1. Verify valid JavaScript syntax
    try {
        new vm.Script(rawCode);
    } catch (err) {
        return { valid: false, reason: `Invalid JavaScript: ${err.message}` };
    }

    // 2. Verify module.exports exists
    const hasExport = /module\.exports|exports\.|export\s+default/i.test(rawCode);
    if (!hasExport) {
        return { valid: false, reason: "Missing module.exports in command file." };
    }

    // 3. Verify config object exists
    const hasConfig = /config\s*:\s*\{|config\s*=|exports\.config/i.test(rawCode);
    if (!hasConfig) {
        return { valid: false, reason: "Missing config object in command file." };
    }

    // 4. Verify config.name exists
    const hasName = /name\s*:\s*["'`][a-zA-Z0-9_-]+["'`]|name\s*=\s*["'`][a-zA-Z0-9_-]+["'`]/i.test(rawCode);
    if (!hasName) {
        return { valid: false, reason: "Missing config.name in command file." };
    }

    return { valid: true };
}

/**
 * Automatically reload installed command into bot context.
 */
async function reloadInstalledCommand(cmdName, filePath, api) {
    try {
        const resolvedPath = path.resolve(filePath);
        if (require.cache[resolvedPath]) {
            delete require.cache[resolvedPath];
        }

        const loadedCmd = require(resolvedPath);
        let reloaded = false;

        // GoatBot framework
        if (global.GoatBot) {
            if (typeof global.GoatBot.loadCommand === 'function') {
                try {
                    await global.GoatBot.loadCommand({ commandName: cmdName, filePath: resolvedPath, api });
                    reloaded = true;
                } catch (e) {}
            }
            if (global.GoatBot.commands && typeof global.GoatBot.commands.set === 'function') {
                global.GoatBot.commands.set(cmdName, loadedCmd);
                reloaded = true;
            }
        }

        // Mirai / FCA / C3C frameworks
        if (global.client) {
            if (typeof global.client.loadCommand === 'function') {
                try {
                    await global.client.loadCommand(resolvedPath);
                    reloaded = true;
                } catch (e) {}
            }
            if (global.client.commands && typeof global.client.commands.set === 'function') {
                global.client.commands.set(cmdName, loadedCmd);
                if (loadedCmd.config && loadedCmd.config.name) {
                    global.client.commands.set(loadedCmd.config.name.toLowerCase(), loadedCmd);
                }
                reloaded = true;
            }
        }

        // Generic collections
        if (global.commands && typeof global.commands.set === 'function') {
            global.commands.set(cmdName, loadedCmd);
            reloaded = true;
        }

        if (global.plugins && typeof global.plugins.set === 'function') {
            global.plugins.set(cmdName, loadedCmd);
            reloaded = true;
        }

        if (global.utils && typeof global.utils.loadCommand === 'function') {
            try {
                await global.utils.loadCommand(cmdName);
                reloaded = true;
            } catch (e) {}
        }

        return reloaded;
    } catch (err) {
        return false;
    }
}

/**
 * Format animation frame with step text indicator.
 */
function getAnimFrame(percent, stepText) {
    const totalBars = 10;
    const filled = Math.round((percent / 100) * totalBars);
    const empty = totalBars - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const paddedPercent = `${percent}%`.padEnd(4, ' ');

    return `╭───────────────╮
│      📦 Riyad Store      │
├───────────────┤
│ ${bar} ${paddedPercent} │
╰───────────────╯
${stepText}`;
}

module.exports = {
    config: {
        name: "rs",
        aliases: ["store", "riyadstore"],
        version: "1.1.0",
        author: "Riyad",
        countDown: 5,
        role: 0,
        description: "Access Riyad Store to search, view, install, and update bot commands",
        category: "store",
        guide: {
            en: "Commands:\n" +
                "/rs - Show help menu\n" +
                "/rs list - List available commands\n" +
                "/rs search <keyword> - Search commands\n" +
                "/rs info <id> - View command details\n" +
                "/rs install <id> - Install a command\n" +
                "/rs update <id> - Update a command\n" +
                "/rs featured - View featured commands\n" +
                "/rs latest - View latest commands"
        }
    },

    onStart: async function ({ api, event, args, message, usersData, threadsData }) {
        const subCommand = (args[0] || '').toLowerCase();

        switch (subCommand) {
            case 'list': {
                try {
                    const res = await axios.get(`${BASE_URL}/api/store/list`, { timeout: 10000 });
                    const items = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    if (!items || items.length === 0) {
                        return await replyMsg(api, event, message, "❌ No commands available in Riyad Store.");
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
                    return await replyMsg(api, event, message, listText);
                } catch (error) {
                    return await replyMsg(api, event, message, handleApiOrFsError(error));
                }
            }

            case 'search': {
                const query = args.slice(1).join(" ").trim();
                if (!query) {
                    return await replyMsg(api, event, message, "❌ Please provide a search keyword.\nExample: /rs search ai");
                }

                try {
                    const res = await axios.get(`${BASE_URL}/api/store/search`, {
                        params: { q: query },
                        timeout: 10000
                    });
                    const items = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    if (!items || items.length === 0) {
                        return await replyMsg(api, event, message, `❌ No commands found matching "${query}".`);
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
                    return await replyMsg(api, event, message, searchText);
                } catch (error) {
                    return await replyMsg(api, event, message, handleApiOrFsError(error));
                }
            }

            case 'info': {
                const cmdId = args[1];
                if (!cmdId) {
                    return await replyMsg(api, event, message, "❌ Please provide a command ID.\nExample: /rs info 15");
                }

                try {
                    const res = await axios.get(`${BASE_URL}/api/store/info/${cmdId}`, { timeout: 10000 });
                    const item = res.data?.data || res.data?.result || res.data;

                    if (!item || (!item.name && !item.id)) {
                        return await replyMsg(api, event, message, "❌ Command not found.");
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

                    return await replyMsg(api, event, message, infoText);
                } catch (error) {
                    return await replyMsg(api, event, message, handleApiOrFsError(error));
                }
            }

            case 'featured': {
                try {
                    const res = await axios.get(`${BASE_URL}/api/store/list`, { timeout: 10000 });
                    const allItems = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);
                    
                    const featuredItems = allItems.filter(item => item.featured || item.isFeatured);
                    const displayItems = featuredItems.length > 0 ? featuredItems : allItems.slice(0, 5);

                    if (!displayItems || displayItems.length === 0) {
                        return await replyMsg(api, event, message, "❌ No featured commands available right now.");
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
                    return await replyMsg(api, event, message, featuredText);
                } catch (error) {
                    return await replyMsg(api, event, message, handleApiOrFsError(error));
                }
            }

            case 'latest': {
                try {
                    const res = await axios.get(`${BASE_URL}/api/store/list`, { timeout: 10000 });
                    const allItems = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.result || []);

                    const sortedItems = [...allItems].sort((a, b) => {
                        const idA = parseInt(a.id || 0, 10);
                        const idB = parseInt(b.id || 0, 10);
                        return idB - idA;
                    });
                    const latestItems = sortedItems.slice(0, 10);

                    if (!latestItems || latestItems.length === 0) {
                        return await replyMsg(api, event, message, "❌ No latest commands available.");
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
                    return await replyMsg(api, event, message, latestText);
                } catch (error) {
                    return await replyMsg(api, event, message, handleApiOrFsError(error));
                }
            }

            case 'install':
            case 'update': {
                const cmdId = args[1];
                if (!cmdId) {
                    return await replyMsg(api, event, message, `❌ Please provide a command ID.\nExample: /rs ${subCommand} 15`);
                }

                // Step 1: Connecting...
                let animMsg = await replyMsg(api, event, message, getAnimFrame(0, "📡 Connecting..."));

                let rawCode = "";
                let metaInfo = {
                    name: null,
                    author: "Unknown",
                    category: "General",
                    version: "1.0.0"
                };

                // Step 2: Downloading code...
                await sleep(250);
                animMsg = await editMsg(api, event, message, animMsg, getAnimFrame(20, "🔍 Downloading..."));

                try {
                    const rawRes = await axios.get(`${BASE_URL}/api/store/raw/${cmdId}`, { timeout: 10000 });
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
                    const errMsg = handleApiOrFsError(error);
                    await editMsg(api, event, message, animMsg, errMsg);
                    return;
                }

                if (!rawCode || rawCode.trim().length === 0) {
                    await editMsg(api, event, message, animMsg, "❌ Command not found.");
                    return;
                }

                // Fetch extra metadata
                try {
                    const infoRes = await axios.get(`${BASE_URL}/api/store/info/${cmdId}`, { timeout: 8000 });
                    const infoData = infoRes.data?.data || infoRes.data?.result || infoRes.data;
                    if (infoData && typeof infoData === 'object') {
                        if (infoData.name) metaInfo.name = infoData.name;
                        if (infoData.author) metaInfo.author = infoData.author;
                        if (infoData.category) metaInfo.category = infoData.category;
                        if (infoData.version) metaInfo.version = infoData.version;
                    }
                } catch (err) {
                    // Non-fatal metadata fetch fail
                }

                // Detect command name
                const finalCmdName = detectCommandName(rawCode, metaInfo.name, cmdId);
                const fileName = finalCmdName.endsWith('.js') ? finalCmdName : `${finalCmdName}.js`;
                const cmdsDir = getCommandsDir();
                const targetPath = path.join(cmdsDir, fileName);

                // Duplicate Detection
                if (subCommand === 'install') {
                    const fileExists = await fs.pathExists(targetPath);
                    if (fileExists) {
                        const duplicateNotice = `⚠️ Command already exists.\n\nUse /rs update ${cmdId} to update this command.`;
                        await editMsg(api, event, message, animMsg, duplicateNotice);
                        return;
                    }
                }

                // Code Validation
                const validation = validateCommandCode(rawCode);
                if (!validation.valid) {
                    await editMsg(api, event, message, animMsg, `❌ Invalid command file.\nReason: ${validation.reason}`);
                    return;
                }

                await sleep(250);
                animMsg = await editMsg(api, event, message, animMsg, getAnimFrame(50, "🔍 Downloading..."));

                // Step 3: Saving...
                await sleep(250);
                animMsg = await editMsg(api, event, message, animMsg, getAnimFrame(70, "💾 Saving..."));

                try {
                    await fs.ensureDir(path.dirname(targetPath));
                    await fs.writeFile(targetPath, rawCode, 'utf8');
                } catch (writeErr) {
                    const errMsg = handleApiOrFsError(writeErr);
                    await editMsg(api, event, message, animMsg, errMsg);
                    return;
                }

                // Step 4: Reloading...
                await sleep(250);
                animMsg = await editMsg(api, event, message, animMsg, getAnimFrame(90, "🔄 Reloading..."));

                const isReloaded = await reloadInstalledCommand(finalCmdName, targetPath, api);

                // Step 5: Finished
                await sleep(250);
                animMsg = await editMsg(api, event, message, animMsg, getAnimFrame(100, "✅ Finished"));

                await sleep(300);
                await editMsg(api, event, message, animMsg, "✅ Installation Completed Successfully");

                // Verify file exists on disk
                try {
                    const existsOnDisk = await fs.pathExists(targetPath);
                    const diskContent = existsOnDisk ? await fs.readFile(targetPath, 'utf8') : '';
                    if (!existsOnDisk || !diskContent || diskContent.trim().length === 0) {
                        return await replyMsg(api, event, message, "❌ Unable to save command.");
                    }
                } catch (verifyErr) {
                    return await replyMsg(api, event, message, handleApiOrFsError(verifyErr));
                }

                // Construct success summary
                let header = `✅ Command ${subCommand === 'update' ? 'Updated' : 'Installed'} Successfully`;
                if (!isReloaded) {
                    header = `⚠️ Command installed successfully.\nRestart the bot to load the command.`;
                }

                const successSummary = `${header}

📦 Name: ${finalCmdName}
👤 Author: ${metaInfo.author}
📂 Category: ${metaInfo.category}
🔖 Version: ${metaInfo.version}
🆔 ID: ${cmdId}

━━━━━━━━━━━━━━━━━━

Enjoy using Riyad Store ❤️`;

                return await replyMsg(api, event, message, successSummary);
            }

            default: {
                // Default / Help Menu
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

/rs featured
  └ View featured store commands

/rs latest
  └ View latest uploaded commands
━━━━━━━━━━━━━━━━━━
Usage: /rs <subcommand> [args]`;

                return await replyMsg(api, event, message, helpText);
            }
        }
    }
};
