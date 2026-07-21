/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

// Resolve the notice database path
const dataDir = path.join(process.cwd(), 'data');
const noticesPath = path.join(dataDir, 'notices.json');

// Ensure data/notices.json exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(noticesPath)) {
  const initialNotices = {
  "gn": {
    "text": "",
    "mention": false,
    "image": "notice 1.png"
  },
  "nt": {
    "text": "",
    "mention": false,
    "image": "notice 2.png"
  },
  "ki": {
    "text": "",
    "mention": true,
    "image": "notice 4.png"
  },
  "ga": {
    "text": "",
    "mention": true,
    "image": "notice 5.png"
  },
  "gr": {
    "text": "",
    "mention": false,
    "image": "notice 6.png"
  },
  "nm": {
    "text": "",
    "mention": false,
    "image": "notice 7.png"
  }
}
  fs.writeFileSync(noticesPath, JSON.stringify(initialNotices, null, 2), 'utf-8');
}

/**
 * Core handler logic for the notice system.
 * Highly compatible and robust, parsing all typical structures of Messenger Bot frameworks.
 */
async function handleCommand({ api, event, args }) {
  const { threadID, messageID, messageReply, mentions } = event;
  
  // Safe reply function
  const reply = (text, cb) => {
    if (api && typeof api.sendMessage === 'function') {
      return api.sendMessage(text, threadID, cb || (() => {}), messageID);
    }
    console.log(`[Riyad Bot - Reply]: ${text}`);
  };

  const action = args && args[0] ? args[0].toLowerCase() : '';

  // Load latest notices
  let notices = {};
  try {
    notices = JSON.parse(fs.readFileSync(noticesPath, 'utf-8'));
  } catch (error) {
    console.error("Error reading notices database:", error);
    notices = {};
  }

  // 1. LIST COMMAND (/n list)
  if (action === 'list') {
    const keys = Object.keys(notices);
    if (keys.length === 0) {
      return reply("📋 Notice List is empty.");
    }
    const listBody = keys.map(k => `• ${k}`).join('\n');
    const finalText = `📋 Notice List\n\n${listBody}\n\n⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡`;
    return reply(finalText);
  }

  // 2. ADD COMMAND (/n add <notice_name>)
  if (action === 'add') {
    const noticeName = args[1] ? args[1].toLowerCase() : '';
    if (!noticeName) {
      return reply("❌ Please specify a notice name.\nExample: Reply to a message with '/n add rules'");
    }

    const replyMsg = messageReply || event.message_reply;
    if (!replyMsg) {
      return reply("❌ Please reply to a message to add it as a notice.");
    }

    const textToSave = replyMsg.body || "";

    notices[noticeName] = {
  text: textToSave,
  mention: textToSave.includes("@mention"),
  image: notices[noticeName]?.image || ""
};

    try {
      fs.writeFileSync(noticesPath, JSON.stringify(notices, null, 2), 'utf-8');
      return reply(`✅ Notice "${noticeName}" has been successfully saved!`);
    } catch (err) {
      return reply(`❌ Failed to save notice: ${err.message}`);
    }
  }

  // 3. REMOVE COMMAND (/n remove or /n remove <notice_name>)
  if (action === 'remove') {
    const noticeNameArg = args[1] ? args[1].toLowerCase() : '';
    const replyMsg = messageReply || event.message_reply;

    // Direct deletion by name
    if (noticeNameArg) {
      if (notices[noticeNameArg]) {
        delete notices[noticeNameArg];
        try {
          fs.writeFileSync(noticesPath, JSON.stringify(notices, null, 2), 'utf-8');
          return reply(`🗑️ Notice "${noticeNameArg}" has been deleted.`);
        } catch (err) {
          return reply(`❌ Failed to delete notice: ${err.message}`);
        }
      } else {
        return reply(`❌ Notice "${noticeNameArg}" does not exist.`);
      }
    }

    // Deletion by replying to notice
    if (!replyMsg) {
      return reply("❌ Please reply to an existing notice message to remove it, or specify the notice name.\nExample: /n remove rules");
    }

    let repliedText = (replyMsg.body || "").trim();
    const footer = "⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡";
    if (repliedText.endsWith(footer)) {
      repliedText = repliedText.substring(0, repliedText.length - footer.length).trim();
    }

    let foundKey = null;
    for (const [key, notice] of Object.entries(notices)) {
      if (notice.text.trim() === repliedText) {
        foundKey = key;
        break;
      }
    }

    if (foundKey) {
      delete notices[foundKey];
      try {
        fs.writeFileSync(noticesPath, JSON.stringify(notices, null, 2), 'utf-8');
        return reply(`🗑️ Notice "${foundKey}" has been deleted successfully!`);
      } catch (err) {
        return reply(`❌ Failed to delete notice: ${err.message}`);
      }
    } else {
      return reply("❌ Could not find a notice matching this message in notices.json.");
    }
  }

  // 4. TRIGGER NOTICE (/n <notice_name>)
  const noticeName = action;
  if (!noticeName) {
    return reply("💡 Usage:\n• /n <notice_name>\n• /n list\n• Reply to message: /n add <notice_name>\n• Reply to notice: /n remove");
  }

  const notice = notices[noticeName];

console.log("Notice Path:", noticesPath);
console.log("Notice Name:", noticeName);
console.log("Notice Data:", notice);

if (!notice) {
  return reply(`❌ Notice "${noticeName}" does not exist.`);
}

  // Handle Mention Formatting
  let finalBody = notice.text;
  let finalMentions = [];

  const incomingMentions = mentions || event.mentions;
  if (incomingMentions && Object.keys(incomingMentions).length > 0) {
    const mentionKeys = Object.keys(incomingMentions);
    let tagIndexOffset = 0;

    if (finalBody.includes("@mention")) {
      for (const uid of mentionKeys) {
        const tag = incomingMentions[uid] || "@User";
        const placeholderIndex = finalBody.indexOf("@mention");
        if (placeholderIndex !== -1) {
          finalBody = finalBody.replace("@mention", tag);
          finalMentions.push({
            tag: tag,
            id: uid,
            fromIndex: placeholderIndex
          });
        }
      }
    } else {
      // No placeholder, so we append the tags
      const tagStrings = [];
      for (const uid of mentionKeys) {
        const tag = incomingMentions[uid] || "@User";
        tagStrings.push(tag);
      }
      if (tagStrings.length > 0) {
        finalBody += "\n\nTags: " + tagStrings.join(" ");
        let tagIndex = finalBody.indexOf("Tags: ") + 6;
        for (const uid of mentionKeys) {
          const tag = incomingMentions[uid] || "@User";
          const tagStart = finalBody.indexOf(tag, tagIndex);
          if (tagStart !== -1) {
            finalMentions.push({
              tag: tag,
              id: uid,
              fromIndex: tagStart
            });
            tagIndex = tagStart + tag.length;
          }
        }
      }
    }
  }

  // Append Mandatory Footer
  finalBody = `${finalBody}\n\n⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡`;

  const imagePath = path.join(process.cwd(), "assets", notice.image || "");

const message = {
  body: finalBody,
  mentions: finalMentions
};

if (notice.image && fs.existsSync(imagePath)) {
  message.attachment = [
  fs.createReadStream(imagePath)
];
}

return api.sendMessage(
  message,
  threadID,
  () => {},
  messageID
);
}

// Export for high-level framework loaders (Goat-bot, Mirai-bot, Custom-loaders)
module.exports = {
  config: {
    name: "n",
    aliases: ["notice"],
    version: "1.1.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    shortDescription: "Manage and send custom group notices",
    longDescription: "Allows saving, viewing, listing, and triggering media-rich notices inside Facebook Messenger chats.",
    category: "utility",
    guide: {
      en: "/n <notice_name> | /n list | Reply to a message: /n add <notice_name> | Reply to notice: /n remove"
    }
  },
  
  // Handler hooks for all variations of Riyad Bot Framework
  onStart: handleCommand,
  run: handleCommand,
  execute: handleCommand
};
