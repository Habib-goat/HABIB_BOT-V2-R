/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  config: {
    name: "surah",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Riyad",
    description: "Holy Quran Surahs with complete Arabic text and Bengali pronunciation.",
    commandCategory: "Islamic",
    usages: "[Surah Number]",
    cooldowns: 5
  },

  onStart: async function({ api, event, args }) {
    const { threadID, messageID } = event;

    // Resolve surah.json path: check current folder first, then parent folder
    // Load all 6 JSON files
let surahs = [];

try {
  const files = [
    "surah_001_020.json",
    "surah_021_040.json",
    "surah_041_060.json",
    "surah_061_080.json",
    "surah_081_100.json",
    "surah_101_114.json"
  ];

  for (const file of files) {
    let filePath = path.join(__dirname, file);

    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, "..", file);
    }

    if (!fs.existsSync(filePath)) {
      return api.sendMessage(
        `❌ Database file not found:\n${file}`,
        threadID,
        messageID
      );
    }

    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    surahs.push(...json);
  }
} catch (err) {
  return api.sendMessage(
    "❌ Failed to load Quran database.\n" + err.message,
    threadID,
    messageID
  );
}
      // Feature 1: Menu list when no arguments are provided (e.g. /surah)
    if (args.length === 0) {
      let menuMessage = "📖 RIYAD BOT - HOLY QURAN\n\n";
      menuMessage += `Total Surahs: ${surahs.length}\n\n`;

      // Build the list of all Surahs
      surahs.forEach((surah) => {
        // Pad the number for nice alignment (e.g., 01, 02... 114)
        const paddedNum = String(surah.id).padStart(2, '0');
        menuMessage += `${paddedNum}. ${surah.name}\n`;
      });

      menuMessage += "\nExample usage:\n";
      menuMessage += "• /surah 1 (Al-Fatihah)\n";
      menuMessage += "• /surah 36 (Ya-Sin)\n";
      menuMessage += "• /surah 112 (Al-Ikhlas)";

      return sendLongMessage(api, menuMessage, threadID, messageID);
    }

    // Feature 2: Display specific Surah when number is provided (e.g. /surah 1)
    const surahInput = parseInt(args[0], 10);

    // Validate the input number
    if (isNaN(surahInput) || surahInput < 1 || surahInput > surahs.length) {
      return api.sendMessage(
        `❌ Invalid Surah Number.\nPlease choose a number between 1 and ${surahs.length}.`,
        threadID,
        messageID
      );
    }

    // Fetch the surah by number
    const surah = surahs.find(s => s.id === surahInput);

    if (!surah) {
      return api.sendMessage(
        "❌ Surah not found in the database.",
        threadID,
        messageID
      );
    }

    // Format the Surah message details
    let responseMessage = `📖 ${surah.name}\n`;
responseMessage += `🔤 ${surah.transliteration}\n`;
responseMessage += `📚 ${surah.translation}\n`;
responseMessage += `📌 Total Ayah: ${surah.total_verses}\n`;
responseMessage += `📍 Revealed: ${surah.type}\n\n`;

surah.verses.forEach(v => {
  responseMessage += `(${v.id}) ${v.text}\n`;
  responseMessage += `${v.pronunciation}\n`;
  responseMessage += `${v.translation}\n\n`;
});

return sendLongMessage(api, responseMessage, threadID, messageID);
    }
};
/**
 * Splits and sends a long message to avoid hitting the Facebook Messenger 2000-character limit.
 * Sends chunks sequentially to maintain correct ordering.
 * 
 * @param {object} api - The Messenger API object
 * @param {string} text - The full text to send
 * @param {string} threadID - The target thread ID
 * @param {string} messageID - The original user message ID to reply to (only for the first part)
 */
function sendLongMessage(api, text, threadID, messageID) {
  const CHAR_LIMIT = 1900; // Keep slightly below 2000 to be safe
  
  if (text.length <= CHAR_LIMIT) {
    return api.sendMessage(text, threadID, messageID);
  }

  const chunks = [];
  let currentChunk = "";
  const lines = text.split("\n");

  for (const line of lines) {
    // If adding this line exceeds the limit, push the current chunk and start a new one
    if ((currentChunk + "\n" + line).length > CHAR_LIMIT) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + line : line;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  // Send chunks sequentially
  chunks.forEach((chunk, index) => {
    const chunkMessage = `[Part ${index + 1}/${chunks.length}]\n\n${chunk}`;
    // Reply to the original message for the first part, and send others as subsequent replies/messages
    api.sendMessage(chunkMessage, threadID, index === 0 ? messageID : undefined);
  });
}
