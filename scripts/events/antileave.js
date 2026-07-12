module.exports = {
  config: {
    name: "antileave",
    version: "1.0.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:unsubscribe")
      return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);

    const botID =
      typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : "";

    if (leftUserID === botID)
      return;

    const thread = await threadsData.getThread(threadID);

    if (
      !thread ||
      !(
        thread.antileave === true ||
        (thread.data && thread.data.antileave === true)
      )
    ) {
      return;
    }

    console.log("[ANTILEAVE] Re-adding:", leftUserID);

    try {
  await api.addUserToGroup(leftUserID, threadID);

  console.log("ADD SUCCESS");

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log("SENDING MESSAGE");

  let userName = "Member";

  try {
    const info = await new Promise(resolve => {
      api.getUserInfo(leftUserID, (err, data) => {
        if (err) return resolve(null);
        resolve(data);
      });
    });

    if (info && info[leftUserID])
      userName = info[leftUserID].name;
  } catch {}

  await api.sendMessage({
    body: `🛡️ RIYAD BOT SECURITY

👋 ${userName}

❌ আপনি গ্রুপ থেকে বের হওয়ার চেষ্টা করেছিলেন।

🤖 Riyad Bot-এর অনুমতি ছাড়া এই গ্রুপ ত্যাগ করা যাবে না।

✅ আপনাকে পুনরায় গ্রুপে যুক্ত করা হয়েছে।

❤️ ধন্যবাদ আমাদের সাথে থাকার জন্য।`,
    mentions: [{
      tag: userName,
      id: leftUserID
    }]
  }, threadID);

  console.log("MESSAGE SENT");

} catch (err) {
  console.error("[ANTILEAVE ERROR]", err);

  await api.sendMessage(
    "❌ সদস্যকে পুনরায় গ্রুপে যোগ করা যায়নি।",
    threadID
  );
}
      }
};
