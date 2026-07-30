const config = require('../../config.json');
const database = require('../utils/database');
const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

const replyManager = require('../replies/replyManager');
const reactionManager = require('../reactions/reactionManager');

const cooldowns = new Map(); // key: userId_commandName, value: timestamp
const spamTrack = new Map(); // key: userId, value: [timestamps]
const blockedUsers = new Map(); // key: userId, value: expireTimestamp

// Multi-language translation helper
function getText(langKey, replacements = {}) {
  const lang = config.language || 'en';
  try {
    const langFilePath = path.join(__dirname, `../../languages/${lang}.json`);
    const langData = fs.readJsonSync(langFilePath);
    
    const keys = langKey.split('.');
    let value = langData;
    for (const k of keys) {
      if (value[k] === undefined) return langKey;
      value = value[k];
    }
    
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const [key, val] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`{${key}}`, 'g'), val);
    }
    return text;
  } catch (err) {
    return langKey;
  }
}

// Simulated Facebook/Messenger API Wrapper
function createApiWrapper(wsServer, restLogs) {
  return {
    sendMessage: async (text, threadId, replyMessageId = null) => {
      const messageID = `mid.simulated_${Math.random().toString(36).slice(2)}`;
      const msgLog = `[Sent Message to ${threadId}]: ${text}`;
      logger.info(msgLog);
      
      if (wsServer) {
        wsServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'bot_message', messageID, text, threadId, replyMessageId }));
          }
        });
      }
      
      if (restLogs) {
        restLogs.push({ sender: 'Bot', text, threadId, timestamp: Date.now() });
      }
      
      return { messageID };
    },
    
    // FIXED: unified setReaction that works for both simulated and real API
    setReaction: async (emoji, messageId) => {
      logger.info(`[Reaction] Set reaction ${emoji} to message ${messageId}`);
      if (wsServer) {
        wsServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'bot_reaction', emoji, messageId }));
          }
        });
      }
      return { success: true };
    },

    // Alias so simulated API also responds to setMessageReaction
    setMessageReaction: async (emoji, messageId, callback, forceCustom) => {
      logger.info(`[Reaction] Set message reaction ${emoji} to message ${messageId}`);
      if (wsServer) {
        wsServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'bot_reaction', emoji, messageId }));
          }
        });
      }
      if (typeof callback === 'function') callback(null);
      return { success: true };
    },

    changeNickname: async (nickname, threadId, userId) => {
      logger.info(`[Nickname Change] Changed user ${userId} nickname in thread ${threadId} to ${nickname}`);
      return { success: true };
    }
  };
}

// Helper: safely call setMessageReaction on real FB api or fallback to setReaction
function doSetReaction(api, emoji, messageID) {
  try {
    if (typeof api.setMessageReaction === "function") {
      // Real fca-eryxenx API — callback-style
      api.setMessageReaction(emoji, messageID, () => {}, true);
    } else if (typeof api.setReaction === "function") {
      // Simulated wrapper or other implementations
      api.setReaction(emoji, messageID).catch(() => {});
    }
  } catch (err) {
    // Silently ignore reaction errors — they are non-critical
  }
}

const botEngine = {
  getText,
  
  // Primary message processing router
  processMessage: async (event, commandLoader, eventLoader, wsServer, restLogs, customApi = null) => {
    const api = customApi || createApiWrapper(wsServer, restLogs);
    
    const senderID = event.senderID;
    const threadID = event.threadID;
    const messageID = event.messageID;
    const body = event.body ? event.body.trim() : '';

    // Handle Messenger log events (no message body)
    if (!event.body && event.logMessageType) {
      event.body = "";
    }
    if (event.type === "message_reply") {
      logger.info("[BOTENGINE] Reply event received");
    }
    if (event.type === "message_reaction") {
      logger.info("[BOTENGINE] Reaction event received");
    }

    // ── LOG EVENTS (join / leave / group changes) ──────────────────────────────
    // FIXED: eventLoader.events was never iterated — welcome/goodbye/antileave
    // events were loaded but never dispatched. Now we dispatch to all matching
    // event handlers based on their declared eventType.
    if (event.logMessageType) {
      // 1. Dispatch to eventLoader event handlers (welcome, goodbye, antileave, etc.)
      if (eventLoader && eventLoader.events) {
        for (const [name, ev] of eventLoader.events.entries()) {
          const types = Array.isArray(ev.config?.eventType) ? ev.config.eventType : [];
          if (types.length === 0 || types.includes(event.logMessageType) || types.includes("*")) {
            if (typeof ev.onStart === "function") {
              try {
                await ev.onStart({
                  api,
                  event,
                  usersData: database,
                  threadsData: database,
                  replyManager,
                  reactionManager
                });
              } catch (err) {
                console.error(`[BOTENGINE] Error in event handler '${name}' onStart:`, err?.message || err);
              }
            }
          }
        }
      }

      // 2. Run onEvent hooks for commands (e.g. protect.js)
      for (const [name, cmd] of commandLoader.commands.entries()) {
        if (typeof cmd.onEvent === "function") {
          try {
            await cmd.onEvent({
              api,
              event,
              usersData: database,
              threadsData: database,
              replyManager,
              reactionManager
            });
          } catch (err) {
            console.error(`Error in onEvent for '${name}':`, err?.message || err);
          }
        }
      }
      return;
    }

    if (!senderID || !threadID) return;

    // Intercept reactions
    if (event.reaction) {
      const handledReaction = await reactionManager.handle(api, event, commandLoader);
      if (handledReaction) return;
    }

    // Intercept message replies
    if (event.messageReply) {
      const handledReply = await replyManager.handle(api, event, commandLoader);
      if (handledReply) return;
    }

    // 1. Anti-Spam Mitigation
    if (config.antiSpam.enabled) {
      const now = Date.now();
      
      if (blockedUsers.has(senderID)) {
        const blockExpire = blockedUsers.get(senderID);
        if (now < blockExpire) {
          logger.warn(`User ${senderID} is currently rate-limited.`);
          return;
        } else {
          blockedUsers.delete(senderID);
        }
      }

      if (!spamTrack.has(senderID)) spamTrack.set(senderID, []);
      const userTimestamps = spamTrack.get(senderID);
      userTimestamps.push(now);
      
      const validTimestamps = userTimestamps.filter(t => now - t < config.antiSpam.timeWindow);
      spamTrack.set(senderID, validTimestamps);

      if (validTimestamps.length > config.antiSpam.limit) {
        const blockDuration = config.antiSpam.blockDuration;
        blockedUsers.set(senderID, now + blockDuration);
        
        const blockMsg = getText('system.anti_spam_block', {
          name: event.senderName || senderID,
          id: senderID,
          duration: blockDuration / 1000
        });
        
        await api.sendMessage(blockMsg, threadID);
        return;
      }
    }

    // Load thread and user info
    const threadData = await database.getThread(threadID);
    const userData = await database.getUser(senderID);

    if (event.senderName && userData.name !== event.senderName) {
      await database.updateUser(senderID, {
        name: event.senderName
      });
    }

    // 2. Anti-Link Filter
    if (config.antiLink.enabled && threadData.settings.antiLink) {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      if (urlRegex.test(body)) {
        const isOwner = config.ownerIDs.includes(senderID);
        const isAdmin = config.adminIDs.includes(senderID);
        if (!isOwner && !isAdmin) {
          await api.sendMessage(`⚠️ [ANTI-LINK] Links are not allowed in this thread!`, threadID, messageID);
          return;
        }
      }
    }

    // 3. Anti-Badword Filter
    if (config.antiBadword.enabled && threadData.settings.antiBadword) {
      const containsBadword = config.antiBadword.words.some(word => 
        body.toLowerCase().includes(word.toLowerCase())
      );
      if (containsBadword) {
        await api.sendMessage(`⚠️ [ANTI-BADWORD] Please refrain from using prohibited words in this group.`, threadID, messageID);
        return;
      }
    }

    // 4. Auto-Reaction Trigger
    // FIXED: use setMessageReaction (real fca-eryxenx API) with setReaction fallback
    if (config.autoReact.enabled && body) {
      for (const [key, emoji] of Object.entries(config.autoReact.reactions)) {
        if (body.toLowerCase().includes(key)) {
          doSetReaction(api, emoji, messageID);
        }
      }
    }

    // 5. Auto-Reply Matcher
    if (config.autoReply.enabled) {
      const text = body.trim().toLowerCase();
      const replyMatch = config.autoReply.replies[text];

      if (replyMatch) {
        if (text === "prefix" || text === "/prefix") {
          const axios = require("axios");
          const os = require("os");

          const tempPath = path.join(os.tmpdir(), `prefix_${Date.now()}.gif`);

          try {
            const response = await axios({
              url: "https://files.catbox.moe/qd6dg1.gif",
              method: "GET",
              responseType: "stream"
            });

            await new Promise((resolve, reject) => {
              const writer = fs.createWriteStream(tempPath);
              response.data.pipe(writer);
              writer.on("finish", resolve);
              writer.on("error", reject);
            });

            const result = await api.sendMessage(
              {
                body: replyMatch,
                attachment: fs.createReadStream(tempPath)
              },
              threadID
            );

            fs.unlink(tempPath, () => {});
            return result;
          } catch (err) {
            // If gif download fails, send text-only reply
            return await api.sendMessage(replyMatch, threadID);
          }
        }

        return await api.sendMessage(replyMatch, threadID);
      }
    }

    // 6. onChat hooks for all commands
    for (const [name, cmd] of commandLoader.commands.entries()) {
      if (typeof cmd.onChat === "function") {
        try {
          await cmd.onChat({
            api,
            event,
            args: body.split(/\s+/),
            message: api,
            usersData: database,
            threadsData: database,
            replyManager,
            reactionManager
          });
        } catch (err) {
          logger.error(`Error in onChat hook for command '${name}':`, err);
        }
      }
    }

    // 7. onEvent hooks for all commands (regular chat messages)
    for (const [name, cmd] of commandLoader.commands.entries()) {
      if (typeof cmd.onEvent === "function") {
        try {
          await cmd.onEvent({
            api,
            event,
            message: api,
            usersData: database,
            threadsData: database,
            replyManager,
            reactionManager
          });
        } catch (err) {
          logger.error(`Error in onEvent hook for command '${name}':`, err);
        }
      }
    }

    // 8. Command Execution and Parsing
    const prefix = threadData.prefix || config.prefix;
    const noPrefix = threadData.settings?.noPrefix === true;

    const isCommand =
      body.startsWith(prefix) ||
      (noPrefix && body.trim().length > 0);
    
    let commandName = '';
    let args = [];

    if (body.startsWith(prefix)) {
      const content = body.slice(prefix.length).trim();
      const parts = content.split(/\s+/);
      commandName = parts[0].toLowerCase();
      args = parts.slice(1);
    } else if (noPrefix) {
      const parts = body.trim().split(/\s+/);
      commandName = parts[0].toLowerCase();
      args = parts.slice(1);
    }

    if (!isCommand || !commandName) return;

    // Find Command by Name or Alias
    let cmd = commandLoader.commands.get(commandName);
    if (!cmd && commandLoader.aliases.has(commandName)) {
      const realName = commandLoader.aliases.get(commandName);
      cmd = commandLoader.commands.get(realName);
    }

    if (!cmd) {
      console.log("[DEBUG] Command not found:", commandName);
      return;
    }

    const isOwner = config.ownerIDs.includes(String(senderID));
    const isBotAdmin = config.adminIDs.includes(String(senderID)) || isOwner;
    const isGroupAdmin = event.isGroupAdmin || isBotAdmin;
    const cmdRole = cmd.config.role || 0;

    // 9. Role-based Permission Controls
    if (cmdRole === 3 && !isOwner) {
      await api.sendMessage(getText('system.unauthorized_owner'), threadID, messageID);
      return;
    }
    
    if (cmdRole === 2 && !isBotAdmin) {
      await api.sendMessage(getText('system.unauthorized_admin'), threadID, messageID);
      return;
    }

    if (cmdRole === 1 && !isGroupAdmin) {
      await api.sendMessage(`❌ You must be a Group Admin to use the command '${cmd.config.name}'.`, threadID, messageID);
      return;
    }

    // 10. Cooldown Regulator
    const cooldownTime = (cmd.config.countDown || 0) * 1000;
    if (cooldownTime > 0) {
      const cooldownKey = `${senderID}_${cmd.config.name}`;
      const now = Date.now();
      
      if (cooldowns.has(cooldownKey)) {
        const lastExecuted = cooldowns.get(cooldownKey);
        const timeElapsed = now - lastExecuted;
        
        if (timeElapsed < cooldownTime) {
          const remaining = ((cooldownTime - timeElapsed) / 1000).toFixed(1);
          await api.sendMessage(getText('system.cooldown_wait', {
            seconds: remaining,
            command: cmd.config.name
          }), threadID, messageID);
          return;
        }
      }
      cooldowns.set(cooldownKey, now);
    }

    // 11. Execute onStart
    if (typeof cmd.onStart === 'function') {
      try {
        await database.incrementCommandCount();
        await cmd.onStart({
          api,
          event,
          args,
          message: api,
          usersData: database,
          threadsData: database,
          replyManager,
          reactionManager
        });
      } catch (err) {
        logger.error(`Error executing command '${cmd.config.name}':`, err);
        await api.sendMessage(`❌ [ERROR] An error occurred while executing the command '${cmd.config.name}': ${err.message}`, threadID, messageID);
      }
    }
  }
};

module.exports = botEngine;
