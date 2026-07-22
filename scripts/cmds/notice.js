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

  // =========================
// AUTO IMPORT (RUN ONCE)
// =========================

const defaultNotices = {
  "gn": {
    "text": "‎╔══════════════════════╗\n‎║ 👑✨〔 𝐆𝐑𝐎𝐔𝐏 𝐍𝐎𝐓𝐈𝐂𝐄 〕✨👑 ║\n‎╠══════════════════════╣\n‎║ ☘️━⋆⃝🌈⋆⃝ ┊ র্ঁংধ্ঁনু্ঁ আ্ঁড্ডা্ঁ ব্ঁক্স্ঁ ┊ ⋆⃝🌈⋆⃝━☘️ ║\n‎╠══════════════════════╣\n‎║ 🛡️ 𝐀𝐃𝐌𝐈𝐍 ║\n‎║      ━━ অথবা ━━ ║\n‎║ 👑 𝐂𝐄𝐎 𝐌𝐀𝐌 🌸 & 𝐒𝐈𝐑 🤵 ║\n‎╠══════════════════════╣\n‎║ 🚫 𝐍𝐎 𝐓𝐄𝐗𝐓 / 𝐓𝐄𝐗𝐓 𝐎𝐅𝐅 ║\n‎║ 📢 নোটিশ দিলে সাথে সাথে ║\n‎║ 🔕 সব টেক্সট বন্ধ করুন ║\n‎║ 💬 রিপ্লাই করবেন না ║\n‎║ 🚷 নতুন মেসেজ দিবেন না ║\n‎║ 📜 গ্রুপের নিয়ম মানুন ║\n‎╠══════════════════════╣\n‎║ 🌺 𝐑𝐞𝐬𝐩𝐞𝐜𝐭 𝐀𝐝𝐦𝐢𝐧 🌺 ║\n‎║ 🤝 𝐑𝐞𝐬𝐩𝐞𝐜𝐭 𝐑𝐮𝐥𝐞𝐬 🤝 ║\n‎╚══════════════════════╝",
    "mention": false,
    "image": "notice 1.png"
  },
  "nt": {
    "text": "╔═❖═══🌙═══❖═╗\n   ⛔❰ 𝐍𝐎 𝐓𝐄𝐗𝐓 ❱⛔\n    ✦❰ 𝐍𝐎 𝐓𝐄𝐗𝐓 ❱✦\n   ⛔❰ 𝐍𝐎 𝐓𝐄𝐗𝐓 ❱⛔\n╚═❖═══🌙═══❖═╝\n\n🚫 Admin Notice চলমান\n🔕 সবাই Text OFF রাখুন\n💬 অপ্রয়োজনীয় Message করবেন না\n🔁 Reply বা React দেওয়া থেকে বিরত থাকুন\n⏳ Notice শেষ না হওয়া পর্যন্ত অপেক্ষা করুন\n🤝 Admin অনুমতি না দেওয়া পর্যন্ত কোনো Text করবেন না।",
    "mention": false,
    "image": "notice 2.png"
  },
  "ki": {
    "text": "***‎╔═════❖💎❖═════╗***\n‎     ╔═════❖💎❖═════╗\n‎      🌸 আসসালামু আলাইকুম 🌸\n‎     ╚═════❖💎❖════╝\n\n‎          🌺 ╭──❀❥❀──╮ 🌺\n‎              💖 প্রিয় মেম্বার 💖\n‎              😓@mention\n                   🥺\n‎          🌺 ╰──❀❥❀──╯ 🌺\n\n‎❥︎\"☘️━⋆⃝🌈⋆⃝ ┊ র্ঁংধ্ঁনু্ঁ আঁড্ডাঁ ব্ঁক্স্ঁ ┊ ⋆⃝🌈⋆⃝━☘️\" এ\n‎যোগ দেওয়ার জন্য আন্তরিক ধন্যবাদ। 🥰🦋\n\n‎⚠️ অনেকদিন ধরে আপনি বক্সে এক্টিভ নন।\n‎তাই গ্রুপের নিয়ম অনুযায়ী\n‎আপনাকে রিমুভ করা হচ্ছে। 🌸\n\n‎💌 আবার ADD হতে চাইলে,\n‎যেকোনো এডমিনের ইনবক্সে নক করুন।\n‎✨ আপনাকে পুনরায় ADD করে দেওয়া হবে। 💖\n\n‎🌼 ভালো থাকবেন • সুস্থ থাকবেন 🌼\n\n‎          ╭━━━❖🌹❖━━━╮\n‎      💞 ভালোবাসা অবিরাম 💞\n‎          ╰━━━❖🌹❖━━━╯\n\n‎🤍🌸 আসসালামু আলাইকুম 🌸🤍\n‎╚═════❖💎❖═════╝",
    "mention": true,
    "image": "notice 4.png"
  },
  "ga": {
    "text": "╔═══════ 🎶 ═══════╗\n\n✨🔥 অস্থির গান • সেই গান 🔥✨\n🎧🎶 অস্থির গান • সেই গান 🎶🎧\n💥❤️ অস্থির গান • সেই গান ❤️💥\n🎼✨ অস্থির গান • সেই গান ✨🎼\n🌙🎵 অস্থির গান • সেই গান 🎵🌙\n💫🔥 অস্থির গান • সেই গান 🔥💫\n🎤🎧 অস্থির গান • সেই গান 🎧🎤\n\n✦━━━━━━ 👑 ━━━━━━✦\n💎🌟 @mention 🌟💎\n✦━━━━━━ 👑 ━━━━━━✦\n\n🖤🎶 অস্থির গান • সেই গান 🎶🖤\n⭐💖 অস্থির গান • সেই গান 💖⭐\n🔥🎼 অস্থির গান • সেই গান 🎼🔥\n🎵💫 অস্থির গান • সেই গান 💫🎵\n❤️✨ অস্থির গান • সেই গান ✨❤️\n🎶🌟 অস্থির গান • সেই গান 🌟🎶\n💥🎧 অস্থির গান • সেই গান 🎧💥\n✨🎤 অস্থির গান • সেই গান 🎤✨\n\n╚═══════ 🎶 ═══════╝",
    "mention": true,
    "image": "notice 5.png"
  },
  "gr": {
    "text": "📜━━━━━━━━━━━━━━━━━━📜\n📖 𝐆𝐑𝐎𝐔𝐏 𝐑𝐔𝐋𝐄𝐒 📖\n☘️⋆⃝🌈⋆⃝ ┊ র্ঁংধ্ঁনু্ঁ আ্ঁড্ডা্ঁ ব্ঁক্স্ঁ ┊ ⋆⃝🌈⋆⃝☘️\n📜━━━━━━━━━━━━━━━━━━📜\n\n┏━━━━━━━━━━━━━━┓\n🌸 ① গ্রুপে আসলেই 🤲 সালাম দিবেন।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🤝 ② নতুন হলে 😊 নিজ থেকে পরিচয় 🫶 হয়ে নিবেন।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🔕 ③ Admin Text OFF বললে সবাই সাথে সাথে Text OFF রাখবেন।\n❌ না মানলে Suspend।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🚫 ④ গালি বা খারাপ ব্যবহার করা সম্পূর্ণ নিষেধ।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🔗 ⑤ অন্য গ্রুপ, YouTube, TikTok বা Page Link দেওয়া নিষিদ্ধ।\n🚷 দিলে Ban।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🔞 ⑥ 18+ কথা, খারাপ ছবি বা ভিডিও দেওয়া সম্পূর্ণ নিষিদ্ধ।\n❌ দিলে Ban।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n📩 ⑦ কাউকে Inbox-এ ডাকা বা ইনবক্সে নিয়ে কথা বলা নিষেধ।\n❌ Suspend।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n💖 ⑧ কাউকে ট্রল, অপমান বা কষ্ট দিয়ে কথা বলা যাবে না।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n📹 ⑨ জরুরি কাজ ছাড়া Group Video Call চালু করা নিষিদ্ধ।\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n🖥️ ⑩ Group Screen Share সম্পূর্ণ নিষিদ্ধ।\n❌🚫\n┗━━━━━━━━━━━━━━┛\n\n┏━━━━━━━━━━━━━━┓\n⚠️ ⑪ গ্রুপে ঝামেলা করা যাবে না।\n🚫 করলে Kick মারা হবে।\n┗━━━━━━━━━━━━━━┛\n\n📢━━━━━━━━━━━━━━📢\n⚠️ নিয়ম না মানলে Admin Panel প্রয়োজনীয় ব্যবস্থা নেবে।\n🤝 সবাই নিয়ম মেনে চলুন।\n📢━━━━━━━━━━━━━━📢\n\n🌸✨ ধন্যবাদ ✨🌸\n☘️⋆⃝🌈⋆⃝ ┊ র্ঁংধ্ঁনু্ঁ আ্ঁড্ডা্ঁ ব্ঁক্স্ঁ ┊ ⋆⃝🌈⋆⃝☘️",
    "mention": false,
    "image": "notice 6.png"
  },
  "nm": {
    "text": "╔═══════ 🕌 ═══════╗\n☘️━⋆⃝🌈⋆⃝ ┊ র্ঁংধ্ঁনু্ঁ আ্ঁড্ডা্ঁ ব্ঁক্স্ঁ ┊ ⋆⃝🌈⋆⃝━☘️\n🤲 𝐍𝐀𝐌𝐀𝐙 𝐁𝐑𝐄𝐀𝐊 🤲\n╚═══════ 🕌 ═══════╝\n\n🔔 @everyone\n\n📢 আযান হচ্ছে... 🕌\n🤲 আসুন, সবাই নামাজ আদায় করি।\n\n💭 হতে পারে, আজকের এই ডাকই আল্লাহর পক্ষ থেকে আমাদের শেষ আহ্বান। ❤️\n\n🚫 📵 **𝗡𝗢 𝗧𝗘𝗫𝗧**\n💬 **𝗡𝗢 𝗖𝗛𝗔𝗧**\n🔇 **𝗠𝗨𝗧𝗘 𝗖𝗔𝗟𝗟**\n\n🤍 @Member • @Moderator সবার সহযোগিতা কাম্য।\n\n┏━━━━ ❖ ━━━━┓\n🕌 𝐀𝐋𝐋𝐀𝐇 𝐇𝐀𝐅𝐈𝐙 🕌\n┗━━━━ ❖ ━━━━┛",
    "mention": false,
    "image": "notice 7.png"
  }
};

await Notice.bulkWrite(
  Object.entries(defaultNotices).map(([name, data]) => ({
    updateOne: {
      filter: { name },
      update: {
        $setOnInsert: {
          name,
          text: data.text,
          mention: data.mention,
          image: data.image
        }
      },
      upsert: true
    }
  }))
);
const action = (args?.[0] || "").toLowerCase();

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
