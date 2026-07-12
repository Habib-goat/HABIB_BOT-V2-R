module.exports = {
  config: {
    name: "antileave",
    version: "1.0.0",
    author: "Riyad Bot",
    role: 1,
    category: "group",
    countDown: 5
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID } = event;

    let thread = await threadsData.getThread(threadID);
    if (!thread) thread = {};
    if (!thread.data) thread.data = {};

    const option = (args[0] || "").toLowerCase();

    if (option === "on") {
      thread.antileave = true;
      thread.data.antileave = true;

      await threadsData.updateThread(threadID, thread);

      return api.sendMessage(
        "🛡️ AntiLeave সফলভাবে চালু হয়েছে।",
        threadID,
        messageID
      );
    }

    if (option === "off") {
      thread.antileave = false;
      thread.data.antileave = false;

      await threadsData.updateThread(threadID, thread);

      return api.sendMessage(
        "❌ AntiLeave সফলভাবে বন্ধ হয়েছে।",
        threadID,
        messageID
      );
    }

    const status =
      thread.antileave ||
      (thread.data && thread.data.antileave)
        ? "🟢 ON"
        : "🔴 OFF";

    return api.sendMessage(
      `🛡️ AntiLeave Status: ${status}\n\nব্যবহার:\n/antileave on\n/antileave off`,
      threadID,
      messageID
    );
  }
};
