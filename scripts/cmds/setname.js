async function checkShortcut(nickname, uid, usersData) {
  try {
    if (/\{userName\}/gi.test(nickname)) {
      const user = await usersData.getUser(uid);
      nickname = nickname.replace(/\{userName\}/gi, user?.name || uid);
    }
    if (/\{userID\}/gi.test(nickname)) {
      nickname = nickname.replace(/\{userID\}/gi, uid);
    }
    return nickname;
  } catch (e) {
    return nickname;
  }
}

module.exports = {
  config: {
    name: "setname",
    aliases: ["nickname", "nick"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 0,
    category: "box chat",
    guide: {
      en: "{pn} <nick name>: change your own nickname\n"
        + "{pn} @tags <nick name>: change nickname of tagged members\n"
        + "{pn} all <nick name>: change nickname of everyone in the group\n\n"
        + "Available shortcuts:\n"
        + "  {userName}: member's name\n"
        + "  {userID}: member's ID"
    },
    description: {
      en: "Change nickname of members in a group chat, using a format."
    }
  },

  onStart: async function ({ args, api, event, usersData }) {
    const { threadID, messageID } = event;
    const mentions = Object.keys(event.mentions || {});
    let uids = [];
    let nickname = args.join(" ");

    if (args[0] === "all" || mentions.includes(threadID)) {
      const threadInfo = await api.getThreadInfo(threadID);
      uids = threadInfo.participantIDs;
      nickname = args[0] === "all"
        ? args.slice(1).join(" ")
        : nickname.replace(event.mentions[threadID], "").trim();
    } else if (mentions.length) {
      uids = mentions;
      const allNameRegex = new RegExp(
        Object.values(event.mentions)
          .map(name => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|"),
        "g"
      );
      nickname = nickname.replace(allNameRegex, "").trim();
    } else {
      uids = [event.senderID];
      nickname = nickname.trim();
    }

    if (!uids.length) {
      return api.sendMessage("⚠️ | No member found to rename.", threadID, messageID);
    }

    try {
      const firstUid = uids.shift();
      await api.changeNickname(await checkShortcut(nickname, firstUid, usersData), threadID, firstUid);
    } catch (e) {
      return api.sendMessage(
        "❌ | An error occurred, try turning off the group's invite link feature and try again later.",
        threadID,
        messageID
      );
    }

    for (const uid of uids) {
      try {
        await api.changeNickname(await checkShortcut(nickname, uid, usersData), threadID, uid);
      } catch (e) {
        // skip members that fail (e.g. left the group) and continue with the rest
      }
    }
  }
};
