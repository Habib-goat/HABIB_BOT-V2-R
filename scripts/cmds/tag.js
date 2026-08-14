module.exports = {
  config: {
    name: "tag",
    version: "1.0.1",
    author: "RiYad",
    role: 0,
    description: "Mention members of the group chat with a custom message.",
    category: "box chat",
    guide: "{pn} [all | message | reply]",
    cooldowns: 5
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID, mentions: eventMentions, messageReply } = event;

    try {
      let threadInfo;
try {
  threadInfo = await threadsData.getThread(threadID) || {};
} catch (e) {
  threadInfo = {};
}

let members = (threadInfo.members || [])
  .filter(m => m.inGroup)
  .map(m => ({ id: m.userID, name: m.name }));

// DB cache is empty until someone runs "refresh group" — so fall back
// to a live fetch from the platform and re-cache it for next time.
if (members.length === 0) {
  try {
    const info = await api.getThreadInfo(threadID);
    const adminIDs = (info.adminIDs || []).map(x => String(x.id || x));
    const liveMembers = (info.userInfo || []).map(u => ({
      userID: String(u.id),
      name: u.name || "",
      inGroup: true,
      isAdmin: adminIDs.includes(String(u.id))
    }));

    if (liveMembers.length > 0) {
      members = liveMembers.map(m => ({ id: m.userID, name: m.name }));

      try {
        await threadsData.updateThread(threadID, {
          id: String(threadID),
          name: info.threadName || info.name || threadInfo.name || "Unknown Group",
          adminIDs,
          members: liveMembers
        });
      } catch (e) {
        // caching failure shouldn't block the tag itself
      }
    }
  } catch (e) {
    // live fetch failed too, members stays empty and we report below
  }
}

      if (members.length === 0) {
        return api.sendMessage("❌ Could not load thread participants list.", threadID, messageID);
      }

      let tagUsers = [];
      let text = "";

      if (messageReply) {
        const uid = messageReply.senderID;
        let name = "Member";
        try {
          if (api.getUserInfoV2) {
            const info = await api.getUserInfoV2(uid);
            name = info.name || "Member";
          } else {
            const matched = members.find(m => m.id == uid);
            name = matched ? matched.name : "Member";
          }
        } catch (e) {
          const matched = members.find(m => m.id == uid);
          name = matched ? matched.name : "Member";
        }

        tagUsers.push({ name: name, id: uid });
        text = args.join(" ");
      } 
      else if (args[0] && ["all", "everyone", "cdi"].includes(args[0].toLowerCase())) {
        tagUsers = members;
        text = args.slice(1).join(" ");
      } 
      else {
        if (!args[0]) {
          return api.sendMessage(
            "⚠️ Please reply to someone's message, enter a specific name, or use 'all' to tag everyone.\nExample: tag all Hello group!",
            threadID,
            messageID
          );
        }

        const searchName = args[0].toLowerCase();
        text = args.slice(1).join(" ");

        tagUsers = members.filter(member =>
          member.name && member.name.toLowerCase().includes(searchName)
        );

        if (tagUsers.length === 0) {
          return api.sendMessage("❌ User not found in this group chat.", threadID, messageID);
        }
      }

      const mentions = tagUsers.map(user => ({
        tag: user.name,
        id: user.id
      }));

      const namesText = tagUsers
        .map(user => `• @${user.name}`)
        .join("\n");

      const body = text
        ? `╭─ 📢 Tag Notification\n${namesText}\n├──────────────\n💬 Message: ${text}\n╰──────────────`
        : `╭─ 📢 Tag Notification\n${namesText}\n╰──────────────`;

      return api.sendMessage(
        {
          body: body,
          mentions: mentions
        },
        threadID,
        messageReply ? messageReply.messageID : messageID
      );
    } catch (error) {
      return api.sendMessage("❌ Error: " + error.message, threadID, messageID);
    }
  }
};
