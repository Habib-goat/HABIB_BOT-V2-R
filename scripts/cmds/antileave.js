module.exports = {
  config: {
    name: "antileave",
    version: "1.0.0",
    author: "Riyad Bot",
    role: 1,
    category: "group",
    countDown: 5,
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID } = event;

    // ==========================
    // LEAVE EVENT
    // ==========================
    if (event.logMessageType === "log:unsubscribe") {
      try {
        const leftUserID = event.logMessageData.leftParticipantFbId;
        if (!leftUserID) return;

        const botID =
          typeof api.getCurrentUserID === "function"
            ? api.getCurrentUserID()
            : null;

        if (leftUserID == botID) return;

        let thread = await threadsData.getThread(threadID);
        if (!thread) return;

        const enabled =
          thread.antileave === true ||
          (thread.data && thread.data.antileave === true);

        if (!enabled) return;

        await api.addUserToGroup(leftUserID, threadID);

        api.sendMessage(
          "🛡️ AntiLeave সক্রিয় ছিল। সদস্যকে পুনরায় গ্রুপে যুক্ত করা হয়েছে।",
          threadID
        );
      } catch (err) {
        console.error("[ANTILEAVE]", err);
      }
      return;
    }

    // ==========================
    // COMMAND
    // ==========================

    const option = (args[0] || "").toLowerCase();

    let thread = await threadsData.getThread(threadID);
    if (!thread) thread = {};
    if (!thread.data) thread.data = {};

    if (option === "on") {
      thread.antileave = true;
      thread.data.antileave = true;

      await threadsData.updateThread(threadID, thread);

      return api.sendMessage(
        "✅ AntiLeave চালু হয়েছে।",
        threadID,
        messageID
      );
    }

    if (option === "off") {
      thread.antileave = false;
      thread.data.antileave = false;

      await threadsData.updateThread(threadID, thread);

      return api.sendMessage(
        "❌ AntiLeave বন্ধ হয়েছে।",
        threadID,
        messageID
      );
    }

    const status =
      thread.antileave || (thread.data && thread.data.antileave)
        ? "🟢 ON"
        : "🔴 OFF";

    return api.sendMessage(
      `🛡️ AntiLeave Status: ${status}\n\nব্যবহার:\n/antileave on\n/antileave off`,
      threadID,
      messageID
    );
  }
};
