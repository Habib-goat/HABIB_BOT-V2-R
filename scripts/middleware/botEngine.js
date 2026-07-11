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
    
    // Split key by '.' (e.g., 'system.starting')
    const keys = langKey.split('.');
    let value = langData;
    for (const k of keys) {
      if (value[k] === undefined) return langKey;
      value = value[k];
    }
    
    // Replace place holders (e.g., {count})
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
      
      // Dispatch via WebSocket for real-time console feedback
      if (wsServer) {
        wsServer.clients.forEach(client => {
          if (client.readyState === 1) { // OPEN
            client.send(JSON.stringify({ type: 'bot_message', messageID, text, threadId, replyMessageId }));
          }
        });
      }
      
      if (restLogs) {
        restLogs.push({ sender: 'Bot', text, threadId, timestamp: Date.now() });
      }
      
      return { messageID };
    },
    
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

    changeNickname: async (nickname, threadId, userId) => {
      logger.info(`[Nickname Change] Changed user ${userId} nickname in thread ${threadId} to ${nickname}`);
      return { success: true };
    }
  };
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
    console.log("[DEBUG] BODY:", body);

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
      
      // Check if user is blocked
      if (blockedUsers.has(senderID)) {
        const blockExpire = blockedUsers.get(senderID);
        if (now < blockExpire) {
          logger.warn(`User ${senderID} is currently rate-limited.`);
          return; // Ignore spam messages
        } else {
          blockedUsers.delete(senderID); // Unblock
        }
      }

      // Track timestamps of messages
      if (!spamTrack.has(senderID)) spamTrack.set(senderID, []);
      const userTimestamps = spamTrack.get(senderID);
      userTimestamps.push(now);
      
      // Keep only logs inside the config window (e.g., 10s)
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
    const threadData = database.getThread(threadID);
    const userData = database.getUser(senderID);

    // Update user display name if captured
    if (event.senderName && userData.name !== event.senderName) {
      database.updateUser(senderID, { name: event.senderName });
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
    if (config.autoReact.enabled) {
      for (const [key, emoji] of Object.entries(config.autoReact.reactions)) {
        if (body.toLowerCase().includes(key)) {
          await api.setReaction(emoji, messageID);
        }
      }
    }

    // 5. Auto-Reply Matcher
    if (config.autoReply.enabled && threadData.settings.autoReply) {
      const replyMatch = config.autoReply.replies[body.toLowerCase()];
      if (replyMatch) {

  // Prefix reply with GIF
  if (body.toLowerCase() === "prefix") {
    const gifPath = path.join(__dirname, "../../assets/prefix.gif");

    await api.sendMessage(
  {
    body: replyMatch,
    attachment: fs.createReadStream(gifPath)
  },
  threadID
);

    return;
  }

  await api.sendMessage(replyMatch, threadID, messageID);
  return;
}
    }
    // 6. Command Execution and Parsing
    const prefix = threadData.prefix || config.prefix;
    const isCommand = body.startsWith(prefix);
    
    // Command variables
    let commandName = '';
    let args = [];

    if (isCommand) {
      const content = body.slice(prefix.length).trim();
      const parts = content.split(/\s+/);
      commandName = parts[0].toLowerCase();
      args = parts.slice(1);
    }

    console.log("[DEBUG] COMMAND:", commandName);

console.log("HAS AUTOSEEN:", commandLoader.commands.has("autoseen"));

for (const [name, cmd] of commandLoader.commands.entries()) {

  console.log("CHECK:", name, "onChat =", typeof cmd.onChat);

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

    console.log("[DEBUG] Command found:", cmd.config.name);

    // 7. Role-based Permission Controls
    // role: 0 = everyone, 1 = group admin, 2 = bot admin, 3 = owner
    const isOwner = config.ownerIDs.includes(senderID);
    const isBotAdmin = config.adminIDs.includes(senderID) || isOwner;
    const isGroupAdmin = event.isGroupAdmin || isBotAdmin; // If bot admin, they inherit group admin

    const cmdRole = cmd.config.role || 0;

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

    // 8. Cooldown Regulator
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
      // Register current execution time
      cooldowns.set(cooldownKey, now);
    }

    // 9. Execute onStart
    if (typeof cmd.onStart === 'function') {
      try {
        database.incrementCommandCount();
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
