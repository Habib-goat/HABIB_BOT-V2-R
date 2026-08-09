module.exports = {
  config: {
    name: "kick",
    version: "1.7.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 1,
    description: "Remove members from the chat box.",
    category: "owner",
    guide: "{pn} @tag (or reply to the member's message)"
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID, messageReply, mentions } = event;
    const botID = String(
      typeof api.getCurrentUserID === "function"
        ? api.getCurrentUserID()
        : (api.getCurrentUserID || api.botID || "")
    );

    let threadInfo = {};
    try {
      threadInfo = await threadsData.getThread(threadID) || {};
    } catch (_) {}

    // E2EE messages do not always contain mention metadata. Fetch the live
    // member list as a fallback; the adapter converts the JID to a thread key.
    if ((!Array.isArray(threadInfo.members) || threadInfo.members.length === 0)
        && typeof api.getThreadInfo === "function") {
      try {
        const live = await api.getThreadInfo(threadID);
        const adminIDs = (live.adminIDs || []).map((x) => String(x.id || x));
        threadInfo.members = (live.userInfo || live.members || []).map((m) => ({
          userID: String(m.id || m.userID),
          name: m.name || m.fullName || "",
          isAdmin: adminIDs.includes(String(m.id || m.userID))
        }));
        try {
          await threadsData.updateThread(threadID, { members: threadInfo.members });
        } catch (_) {}
      } catch (_) {}
    }

    const targetIDs = new Set(
      Object.keys(mentions || {}).filter((id) => String(id) !== botID)
    );

    if (targetIDs.size === 0 && messageReply && messageReply.senderID) {
      if (String(messageReply.senderID) !== botID) {
        targetIDs.add(String(messageReply.senderID));
      }
    }

    if (targetIDs.size === 0 && args.length > 0) {
      const text = args.join(" ").replace(/^@/, "").trim().toLowerCase();
      for (const member of threadInfo.members || []) {
        if (member.name && text.includes(String(member.name).toLowerCase())
            && String(member.userID) !== botID) {
          targetIDs.add(String(member.userID));
        }
      }
    }

    if (targetIDs.size === 0) {
      return api.sendMessage(
        "⚠️ Please tag the member or reply to their message.",
        threadID,
        messageID
      );
    }

    for (const userID of targetIDs) {
      try {
        await api.removeUserFromGroup(String(userID), threadID);
      } catch (err) {
        return api.sendMessage(
          "❌ " + (err?.errorDescription || err?.error || err?.message || String(err)),
          threadID,
          messageID
        );
      }
    }

    return api.sendMessage(
      `✅ Removed ${targetIDs.size} member${targetIDs.size === 1 ? "" : "s"} from the group.`,
      threadID,
      messageID
    );
  }
};
