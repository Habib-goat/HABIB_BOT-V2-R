module.exports = {
  config: {
    name: "antileave",
    eventType: ["log:unsubscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:unsubscribe")
      return;

    const { threadID } = event;
    const leftUserID = String(event.logMessageData.leftParticipantFbId);

    const botID =
      typeof api.getCurrentUserID === "function"
        ? api.getCurrentUserID()
        : null;

    if (String(botID) === leftUserID)
      return;

    const thread = await threadsData.getThread(threadID);

    if (
      !thread ||
      !(thread.antileave ||
        (thread.data && thread.data.antileave))
    )
      return;
console.log("[ANTILEAVE] API METHODS:");
console.log(
  Object.keys(api).filter(x =>
    x.toLowerCase().includes("group") ||
    x.toLowerCase().includes("user")
  )
);
    console.log("[ANTILEAVE] Adding:", leftUserID);

    try {
      await new Promise((resolve, reject) => {
  api.addUserToGroup(leftUserID, threadID, (err) => {
    if (err) return reject(err);
    resolve();
  });
});

      await api.sendMessage(
        "✅ সদস্যকে আবার গ্রুপে যোগ করা হয়েছে।",
        threadID
      );
    } catch (err) {
      console.error("[ANTILEAVE ERROR]", err);

      await api.sendMessage(
        "❌ সদস্যকে আবার যোগ করা যায়নি।",
        threadID
      );
    }
  }
};
