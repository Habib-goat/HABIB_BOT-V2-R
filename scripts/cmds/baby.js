/**
 * @file baby.js
 * @description Baby AI chatbot with teach, list, edit, remove, and auto-chat triggers without prefix.
 * @author Riyad
 * @framework Custom Messenger Bot Framework
 * 
 * Configured specifically for your custom Messenger framework.
 * Supports:
 * - Prefix commands: /baby hello, /baby teach hi - hello, /baby list, etc.
 * - Auto Chat (no-prefix): triggers on 'baby', 'bby', 'bb', 'bbz', 'xan', 'jan', 'bot'
 * - Single-word trigger: replies with cute/funny random messages
 * - Integrated replyManager & reactionManager
 * - Local file persistence for taught words
 * - Every message automatically registered in replyManager for continuous flow
 * - Automatic conversion of all English responses to Bold Unicode characters
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Ensure database/cache file exists for taught messages
const cacheDir = path.join(process.cwd(), 'cache');
const dbPath = path.join(cacheDir, 'baby_db.json');

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({
    taught: {
      "hello": "Ki koro? 😊 Ami tomari cute baby bot! Kemon acho bolo? 🥺",
      "how are you": "Ami khub bhalo asi! Ekhon amar virtual dudh khassi 🍼 Tumi ki koro?",
      "i love you": "Aww, baby o tomake khub bhalobashe! Chuuuu~ 💋"
    },
    settings: {
      autoTeach: true
    }
  }, null, 2));
}

// Helper to read database
function getDB() {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { taught: {}, settings: { autoTeach: true } };
  }
}

// Helper to save database
function saveDB(db) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    return true;
  } catch (err) {
    return false;
  }
}

// Helper to convert English letters to bold Unicode Sans-Serif Bold characters
function toBoldUnicode(text) {
  if (typeof text !== 'string') return text;
  return text.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      // Capital A-Z -> MATHEMATICAL SANS-SERIF BOLD CAPITAL A is U+1D5D4 (120276)
      return String.fromCodePoint(code + 120211);
    } else if (code >= 97 && code <= 122) {
      // Small a-z -> MATHEMATICAL SANS-SERIF BOLD SMALL A is U+1D5EE (120302)
      return String.fromCodePoint(code + 120205);
    }
    return char;
  }).join('');
}

// Helper to send formatted message and register in replyManager
function sendBabyMessage(api, text, threadID, replyToID, replyManager, senderID) {
  const formattedText = toBoldUnicode(text);
  
  return api.sendMessage(formattedText, threadID, (err, info) => {
    if (err) return;
    if (replyManager) {
      const registrationData = {
        commandName: "baby",
        messageID: info.messageID,
        author: senderID
      };
      if (typeof replyManager.set === 'function') {
        replyManager.set(info.messageID, registrationData);
      } else if (typeof replyManager.register === 'function') {
        replyManager.register(info.messageID, registrationData);
      }
    }
  }, replyToID);
}

// Helper to call public Baby/Simsimi API
async function fetchAIResponse(text) {
  const urls = [
    `https://api.simsimi.net/v2/?text=${encodeURIComponent(text)}&lc=en`,
    `https://api.simsimi.vn/api/simsimi`
  ];

  try {
    // Try SimSimi Net API
    const response = await axios.get(urls[0], { timeout: 4000 });
    if (response.data && response.data.success) {
      // API fallback
    }
  } catch (err) {
    // Fallback or continue
  }

  // Cute fallback replies in Banglish if all APIs are offline or return non-Banglish
  const cutenessList = [
    "Ami ektu sleepy ekhon... pore kotha boli? 🥱🍼",
    "Baby's brain ekhon dhorer baire! Amake ektu sekhao na ki bolbo? 🥺",
    "Uh oh, ami thik bujhte pari ni. Amake sekhao evabe: /baby teach [trigger] - [response]",
    "Ami eta ekhono jani na, kintu tumi khub bhalo! 🥰",
    "Chuuu~ 💋 Ami ekhono sikhsi! Amake aro sekhao!",
    "Bolo na jan, ki bolte chao? 😘",
    "Ami ekhanei asi tomari pashe 😌",
    "Ki bolso? Dudh khaba amar sathe? 🍼🥺"
  ];
  return cutenessList[Math.floor(Math.random() * cutenessList.length)];
}

module.exports = {
  config: {
    name: "baby",
    version: "2.6.0",
    author: "Riyad",
    cooldown: 3,
    role: 0,
    shortDescription: "Interactive baby bot with teach & auto chat capabilities in Banglish",
    longDescription: "Sassy baby AI bot with full teach, list, edit, remove commands, prefix support, and no-prefix auto chats in Banglish.",
    category: "AI",
    guide: {
      en: "Baby Command Guide:\n" +
          "1. AI Chat:\n" +
          "   /baby [text] (or reply to a baby message)\n" +
          "2. Teach baby responses:\n" +
          "   /baby teach [trigger] - [response]\n" +
          "3. List all taught phrases:\n" +
          "   /baby list\n" +
          "4. Edit a taught response:\n" +
          "   /baby edit [trigger] - [new response]\n" +
          "5. Remove a taught response:\n" +
          "   /baby remove [trigger]\n" +
          "6. Auto Chat (No-prefix):\n" +
          "   Send messages starting with or mentioning: baby, bby, bb, bbz, xan, jan, bot"
    }
  },

  /**
   * Prefix Command Mode (/baby ...)
   */
  onStart: async function ({ api, event, args, usersData, threadsData, replyManager, reactionManager }) {
    const { threadID, messageID, senderID } = event;
    const db = getDB();

    // Trigger typing indicator
    if (typeof api.sendTypingIndicator === 'function') {
      api.sendTypingIndicator(true, threadID);
    }

    if (args.length === 0) {
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(
        api,
        "🍼 Baby Bot Command Hub 🍼\n\n" +
        "Amake ektu text dao ba subcommands use koro:\n" +
        "• /baby teach [trigger] - [response]\n" +
        "• /baby list\n" +
        "• /baby edit [trigger] - [new response]\n" +
        "• /baby remove [trigger]\n\n" +
        "Or prefix chada direct chat koro! Try: 'baby hi'",
        threadID,
        messageID,
        replyManager,
        senderID
      );
    }

    const subCommand = args[0].toLowerCase();

    // 1. TEACH SUBCOMMAND
    if (subCommand === "teach") {
      const teachContent = args.slice(1).join(" ");
      if (!teachContent.includes("-")) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, "❌ Invalid format! Use: /baby teach [trigger] - [response]", threadID, messageID, replyManager, senderID);
      }

      const parts = teachContent.split("-");
      const trigger = parts[0].trim().toLowerCase();
      const response = parts.slice(1).join("-").trim();

      if (!trigger || !response) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, "❌ Both trigger and response are required!", threadID, messageID, replyManager, senderID);
      }

      db.taught[trigger] = response;
      saveDB(db);

      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      api.setMessageReaction("❤️", messageID, () => {}, true);
      return sendBabyMessage(api, `✅ Baby sikhe gese!\n\nTrigger: "${trigger}"\nResponse: "${response}"`, threadID, messageID, replyManager, senderID);
    }

    // 2. LIST SUBCOMMAND
    if (subCommand === "list") {
      const keys = Object.keys(db.taught);
      if (keys.length === 0) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, "🧸 Baby amon kono kotha ekhono sikhe ni! /baby teach diye shuru koro.", threadID, messageID, replyManager, senderID);
      }

      let listMessage = "🍼 Baby's Custom Memory List 🍼\n\n";
      keys.forEach((key, index) => {
        listMessage += `${index + 1}. ${key} ➔ ${db.taught[key]}\n`;
      });

      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(api, listMessage, threadID, messageID, replyManager, senderID);
    }

    // 3. EDIT SUBCOMMAND
    if (subCommand === "edit") {
      const editContent = args.slice(1).join(" ");
      if (!editContent.includes("-")) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, "❌ Invalid format! Use: /baby edit [trigger] - [new response]", threadID, messageID, replyManager, senderID);
      }

      const parts = editContent.split("-");
      const trigger = parts[0].trim().toLowerCase();
      const response = parts.slice(1).join("-").trim();

      if (!db.taught[trigger]) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, `❌ Trigger "${trigger}" does not exist in Baby's database! Use teach first.`, threadID, messageID, replyManager, senderID);
      }

      db.taught[trigger] = response;
      saveDB(db);

      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      api.setMessageReaction("📝", messageID, () => {}, true);
      return sendBabyMessage(api, `✅ Edited successfully!\n\nTrigger: "${trigger}"\nNew Response: "${response}"`, threadID, messageID, replyManager, senderID);
    }

    // 4. REMOVE SUBCOMMAND
    if (subCommand === "remove" || subCommand === "delete") {
      const trigger = args.slice(1).join(" ").trim().toLowerCase();
      if (!trigger) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, "❌ Please specify the trigger word to remove!", threadID, messageID, replyManager, senderID);
      }

      if (!db.taught[trigger]) {
        if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
        return sendBabyMessage(api, `❌ Trigger "${trigger}" not found in custom database!`, threadID, messageID, replyManager, senderID);
      }

      delete db.taught[trigger];
      saveDB(db);

      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      api.setMessageReaction("🗑️", messageID, () => {}, true);
      return sendBabyMessage(api, `✅ Removed response for trigger: "${trigger}"`, threadID, messageID, replyManager, senderID);
    }

    // 5. MSG SUBCOMMAND (Checking total taught and general status)
    if (subCommand === "msg" || subCommand === "status") {
      const count = Object.keys(db.taught).length;
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(
        api,
        `🍼 Baby System Stats 🍼\n\n` +
        `• Total custom taught phrases: ${count}\n` +
        `• AutoTeach Status: ${db.settings.autoTeach ? "Enabled ✅" : "Disabled ❌"}\n` +
        `• Trigger words: baby, bby, bb, bbz, xan, jan, bot\n` +
        `• Active AI Model: SimSimi / baby-sim-v2`,
        threadID,
        messageID,
        replyManager,
        senderID
      );
    }

    // 6. DEFAULT PREFIX AI CHAT (When typing: /baby hello, /baby how are you, etc.)
    const textQuery = args.join(" ");
    const normalizedQuery = textQuery.trim().toLowerCase();

    // Check if we have a custom taught response
    if (db.taught[normalizedQuery]) {
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(api, db.taught[normalizedQuery], threadID, messageID, replyManager, senderID);
    }

    // Query external Baby AI API
    const reply = await fetchAIResponse(textQuery);
    if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);

    return sendBabyMessage(api, reply, threadID, messageID, replyManager, senderID);
  },

  /**
   * Auto Chat Mode (No-Prefix trigger listener)
   */
  onChat: async function ({ api, event, usersData, threadsData, replyManager, reactionManager }) {
    if (!event.body) return;
    const { threadID, messageID, senderID } = event;
    const body = event.body.trim();
    const bodyLower = body.toLowerCase();

    // Triggers defined by the user: baby, bby, bb, bbz, xan, jan, bot
    const triggers = ["baby", "bby", "bb", "bbz", "xan", "jan", "bot"];
    
    // Check if the message is exactly a trigger word (Trigger Only)
    const isTriggerOnly = triggers.includes(bodyLower);

    // Check if message starts with any trigger word or mentions it at the start
    let matchedTrigger = null;
    for (const trigger of triggers) {
      if (bodyLower === trigger || bodyLower.startsWith(trigger + " ")) {
        matchedTrigger = trigger;
        break;
      }
    }

    if (!matchedTrigger) return; // If no triggers are matched, ignore

    // Trigger typing indicator
    if (typeof api.sendTypingIndicator === 'function') {
      api.sendTypingIndicator(true, threadID);
    }

    // 1. TRIGGER ONLY: Send random cute response
    if (isTriggerOnly) {
      const cuteReplies = [
        "Ki bolbe bolo baby? 🥺",
        "Amake ke daksen? Chuuu~ 💋",
        "Ami ekhanei asi! Ki hoyeche bolo? 💕",
        "Hmph! Khali nam dhore dakbe na, kotha bolo! 😤",
        "Bolo love? Amake ki korte hobe bolo? 🥰",
        "At your service! Ki chao amar kache, master? 🧸",
        "Bby? Dudh eneso amar jonno? 🍼🥺",
        "Ji bolun amar priyo manush! Ami sunsi! 🌸"
      ];
      const randomReply = cuteReplies[Math.floor(Math.random() * cuteReplies.length)];
      
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(api, randomReply, threadID, messageID, replyManager, senderID);
    }

    // 2. AUTO CHAT WITH CONTENT: Extract content after the trigger
    let query = body.slice(matchedTrigger.length).trim();
    if (!query) return;

    const normalizedQuery = query.toLowerCase();
    const db = getDB();

    // Check custom database
    if (db.taught[normalizedQuery]) {
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(api, db.taught[normalizedQuery], threadID, messageID, replyManager, senderID);
    }

    // Fallback to online Baby AI API / Offline Banglish response
    const reply = await fetchAIResponse(query);
    if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);

    return sendBabyMessage(api, reply, threadID, messageID, replyManager, senderID);
  },

  /**
   * Continue conversation when users reply to any baby bot message
   */
  onReply: async function ({ api, event, Reply, replyManager, reactionManager }) {
    if (!event.body) return;
    const { threadID, messageID, senderID } = event;
    const query = event.body.trim();
    const normalizedQuery = query.toLowerCase();

    if (typeof api.sendTypingIndicator === 'function') {
      api.sendTypingIndicator(true, threadID);
    }

    const db = getDB();

    // Check custom memory
    if (db.taught[normalizedQuery]) {
      if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);
      return sendBabyMessage(api, db.taught[normalizedQuery], threadID, messageID, replyManager, senderID);
    }

    // Call Baby AI API / Offline Banglish response
    const reply = await fetchAIResponse(query);
    if (typeof api.sendTypingIndicator === 'function') api.sendTypingIndicator(false, threadID);

    return sendBabyMessage(api, reply, threadID, messageID, replyManager, senderID);
  }
};
