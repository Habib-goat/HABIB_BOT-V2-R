module.exports = {
  config: {
    name: "memberWelcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!Array.isArray(addedParticipants)) return;

    const botID =
      typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : "";

    let groupName = "Group Chat";

    try {
  console.log("[WELCOME] START");

  if (typeof api.getThreadInfo === "function") {
    console.log("[WELCOME] Before getThreadInfo");

    const info = await api.getThreadInfo(threadID);

    console.log("[WELCOME] After getThreadInfo:", info);

    groupName =
      info?.threadName ||
      info?.name ||
      "Group Chat";
  } else {
    console.log("[WELCOME] Using threadsData");

    const threadInfo = await threadsData.getThread(threadID);

    console.log("[WELCOME] ThreadData:", threadInfo);

    groupName = threadInfo?.name || "Group Chat";
  }
} catch (err) {
  console.error("[WELCOME] getThreadInfo ERROR:", err?.stack || err);

  try {
    const threadInfo = await threadsData.getThread(threadID);
    groupName = threadInfo?.name || "Group Chat";
  } catch (err2) {
    console.error("[WELCOME] threadsData ERROR:", err2?.stack || err2);
  }
}

    for (const participant of addedParticipants) {
      console.log("[WELCOME] Member:", participant.fullName);
      if (botID && String(participant.userFbId) === botID)
        continue;

      const memberName =
        participant.fullName || "New Member";

      const welcomeMessage = `✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨

꧁༒☬ ${groupName} ☬༒꧂

🌻 গ্রুপের পক্ষ থেকে 🌻

😘আপনাকে স্বাগতম 🥀

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

🌷╔═════ஓ๑♡๑ஓ═════╗🌷
🌸      ✨ WELCOME ✨        🌸
🌷╚═════ஓ๑♡๑ஓ═════╝🌷

▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬

⚡ŘŊɎĀĐ_ƁƟƬ🔥

━━━━━━━━━━━
🎉 আপনাদের সবাইকে অভিনন্দন 🎉
━━━━━━━━━━━

✨═══❁═══✨

   ⭐ 🍄 ${memberName} 🍄⭐

✨═══❁═══✨

┊┊┊┊┊❤️

┊┊┊┊🧡

┊┊┊💛

┊┊💚

┊💙

💜

✨▬▬▬▬▬ஜ۩۞۩ஜ▬▬▬▬▬✨`;

      try {
  console.log("[WELCOME] Sending...");

  await Promise.resolve(
    api.sendMessage(welcomeMessage, threadID)
  );

  console.log("[WELCOME] Sent successfully");
} catch (err) {
  console.error("[WELCOME ERROR]", err?.stack || err);
}
    }
  }
};
