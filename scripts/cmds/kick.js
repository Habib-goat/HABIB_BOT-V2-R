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
    const userId = (value) => {
      const raw = value == null ? "" : String(value);
      return (raw.match(/^(\d+)/) || [])[1] || raw.replace(/@(?:g\.us|group\.facebook\.com)$/i, "");
    };
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

    const targetIDs = new Set();
    if (Array.isArray(mentions)) {
      for (const mention of mentions) {
        const id = userId(mention && (mention.id || mention.userID || mention.userId || mention.uid));
        if (id && id !== botID) targetIDs.add(id);
      }
    } else {
      for (const id of Object.keys(mentions || {})) {
        const normalized = userId(id);
        if (normalized && normalized !== botID) targetIDs.add(normalized);
      }
    }

    const replySender = messageReply && (
      messageReply.senderID || messageReply.senderId || messageReply.userID || messageReply.from
    );
    if (targetIDs.size === 0 && replySender) {
      const normalized = userId(replySender);
      if (normalized && normalized !== botID) targetIDs.add(normalized);
    }

    if (targetIDs.size === 0 && args.length > 0) {
      const text = args.join(" ").replace(/^@/, "").trim().toLowerCase();
      for (const member of threadInfo.members || []) {
        if (member.name && text.includes(String(member.name).toLowerCase())
            && String(member.userID) !== botID) {
            targetIDs.add(userId(member.userID || member.id));
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
