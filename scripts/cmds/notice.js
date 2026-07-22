/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require("fs");
const path = require("path");
const Notice = require("../models/Notice");

async function handleCommand({ api, event, args }) {
  const {
    threadID,
    messageID,
    messageReply,
    mentions
  } = event;

  const reply = (text, cb) => {
    if (api && typeof api.sendMessage === "function") {
      return api.sendMessage(
        text,
        threadID,
        cb || (() => {}),
        messageID
      );
    }

    console.log(text);
  };

  const action = (args?.[0] || "").toLowerCase();

  // Load all notices from MongoDB
  const noticeDocs = await Notice.find({});

  const notices = {};

  for (const doc of noticeDocs) {
    notices[doc.name] = {
      text: doc.text,
      mention: doc.mention,
      image: doc.image
    };
  }

  // =========================
  // LIST
  // =========================

  if (action === "list") {
    const names = Object.keys(notices);

    if (!names.length) {
      return reply("📋 Notice List is empty.");
    }

    return reply(
      "📋 Notice List\n\n" +
      names.map(i => `• ${i}`).join("\n") +
      "\n\n⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡"
    );
  }

  // =========================
  // ADD
  // =========================

  if (action === "add") {
    const noticeName = (args[1] || "").toLowerCase();

    if (!noticeName) {
      return reply(
        "❌ Example:\nReply a message then:\n/n add rules"
      );
    }

    const replied = messageReply || event.message_reply;

    if (!replied) {
      return reply("❌ Reply to a message first.");
    }

    const body = replied.body || "";
        try {
      const oldNotice = await Notice.findOne({ name: noticeName });

      await Notice.findOneAndUpdate(
        { name: noticeName },
        {
          name: noticeName,
          text: body,
          mention: body.includes("@mention"),
          image: oldNotice?.image || ""
        },
        {
          upsert: true,
          new: true
        }
      );

      return reply(`✅ Notice "${noticeName}" has been saved.`);
    } catch (err) {
      return reply(`❌ ${err.message}`);
    }
  }

  // =========================
  // REMOVE
  // =========================

  if (action === "remove") {
    const noticeName = (args[1] || "").toLowerCase();

    // Remove by name
    if (noticeName) {
      const deleted = await Notice.findOneAndDelete({
        name: noticeName
      });

      if (deleted) {
        return reply(`🗑️ Notice "${noticeName}" deleted.`);
      }

      return reply(`❌ Notice "${noticeName}" not found.`);
    }

    // Remove by replying
    const replied = messageReply || event.message_reply;

    if (!replied) {
      return reply(
        "❌ Reply to a notice message or use:\n/n remove <name>"
      );
    }

    let repliedText = (replied.body || "").trim();

    const footer = "⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡";

    if (repliedText.endsWith(footer)) {
      repliedText = repliedText
        .substring(0, repliedText.length - footer.length)
        .trim();
    }

    const target = await Notice.findOne({
      text: repliedText
    });

    if (!target) {
      return reply("❌ Notice not found.");
    }

    await Notice.deleteOne({
      _id: target._id
    });

    return reply(`🗑️ Notice "${target.name}" deleted.`);
  }

  // =========================
  // SEND NOTICE
  // =========================

  const noticeName = action;

  if (!noticeName) {
    return reply(
      "💡 Usage:\n" +
      "/n list\n" +
      "/n add <name>\n" +
      "/n remove <name>\n" +
      "/n <name>"
    );
  }

  const notice = notices[noticeName];

  if (!notice) {
    return reply(`❌ Notice "${noticeName}" not found.`);
  }

  let finalBody = notice.text;
  let finalMentions = [];
    const incomingMentions = mentions || event.mentions || {};

  if (Object.keys(incomingMentions).length > 0) {

    if (finalBody.includes("@mention")) {

      for (const uid of Object.keys(incomingMentions)) {

        const tag = incomingMentions[uid] || "@User";

        const index = finalBody.indexOf("@mention");

        if (index !== -1) {
          finalBody = finalBody.replace("@mention", tag);

          finalMentions.push({
            tag,
            id: uid,
            fromIndex: index
          });
        }
      }

    } else {

      const tags = [];

      for (const uid of Object.keys(incomingMentions)) {
        tags.push(incomingMentions[uid] || "@User");
      }

      if (tags.length) {

        finalBody += "\n\nTags: " + tags.join(" ");

        let start = finalBody.indexOf("Tags: ") + 6;

        for (const uid of Object.keys(incomingMentions)) {

          const tag = incomingMentions[uid] || "@User";

          const pos = finalBody.indexOf(tag, start);

          if (pos !== -1) {
            finalMentions.push({
              tag,
              id: uid,
              fromIndex: pos
            });

            start = pos + tag.length;
          }
        }
      }
    }
  }

  finalBody += "\n\n⚡🔥 𝗥𝗜𝗬𝗔𝗗 𝗕𝗢𝗧 🔥⚡";

  const message = {
    body: finalBody,
    mentions: finalMentions
  };

  if (notice.image) {

    const imagePath = path.join(
      process.cwd(),
      "assets",
      notice.image
    );

    if (fs.existsSync(imagePath)) {
      message.attachment = [
        fs.createReadStream(imagePath)
      ];
    }
  }

  return api.sendMessage(
    message,
    threadID,
    () => {},
    messageID
  );
}

module.exports = {
  config: {
    name: "n",
    aliases: ["notice"],
    version: "2.0.0",
    author: "Riyad",
    countDown: 5,
    role: 0,
    shortDescription: "Notice System",
    longDescription: "MongoDB Notice System",
    category: "utility",
    guide: {
      en: "/n <name>\n/n list\n/n add <name>\n/n remove <name>"
    }
  },

  onStart: handleCommand,
  run: handleCommand,
  execute: handleCommand
};
