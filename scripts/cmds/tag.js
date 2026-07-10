module.exports = {
  config: {
    name: "tag",
    category: "box chat",
    role: 0,
    author: "EryXenX (Converted)",
    countDown: 3,
    description: "Tag members in the group by keyword, reply, or mention everyone.",
    guide: "{pn} [name] [message] | {pn} all [message] | Reply + {pn} [message]"
  },

  onStart: async ({ api, event, usersData, threadsData, args }) => {
    const { threadID, messageID, messageReply } = event;

    try {
      let threadData;
      try {
        threadData = await threadsData.getThread(threadID);
      } catch (e) {
        threadData = null;
      }

      if (!threadData) {
        return api.sendMessage("❌ Failed to fetch thread information from custom framework database.", threadID, messageID);
      }

      const rawMembers = threadData.members || [];
      const members = rawMembers
        .filter(member => member && member.inGroup)
        .map(member => ({
          name: member.name || "Group Member",
          id: member.userID
        }));

      let tagUsers = [];
      let text = "";

      if (messageReply) {
        const uid = messageReply.senderID;
        let name = "User";
        try {
          if (usersData && typeof usersData.getName === "function") {
            name = await usersData.getName(uid);
          } else {
            const matched = members.find(m => m.id == uid);
            name = matched ? matched.name : "Member";
          }
        } catch (e) {
          const matched = members.find(m => m.id == uid);
          name = matched ? matched.name : "Member";
        }

        tagUsers.push({ name, id: uid });
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
          member.name.toLowerCase().includes(searchName)
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
        .map(user => `• @\${user.name}`)
        .join("\n");

      const body = text
        ? `╭─ 📢 Tag Notification\n\${namesText}\n├──────────────\n💬 Message: \${text}\n╰──────────────`
        : `╭─ 📢 Tag Notification\n\${namesText}\n╰──────────────`;

      return api.sendMessage(
        {
          body,
          mentions
        },
        threadID,
        messageReply ? messageReply.messageID : messageID
      );
    } catch (error) {
      return api.sendMessage(`❌ Error: \${error.message}`, threadID, messageID);
    }
  }
};