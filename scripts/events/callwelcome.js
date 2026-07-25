module.exports = {
  config: {
    name: "callWelcome",
    version: "1.0.0",
    author: "Riyad",
    eventType: ["event", "presence", "message", "typ"]
  },

  onStart: async function ({ api, event }) {
    try {
      console.log("========== CALL DEBUG ==========");
      console.log("TYPE:", event.type);
      console.log("LOG:", event.logMessageType);
      console.log(JSON.stringify(event, null, 2));
      console.log("===============================");

      // টেস্ট: যদি call সম্পর্কিত event পাওয়া যায়
      const logType = String(event.logMessageType || "").toLowerCase();

      if (
        logType.includes("call") ||
        event.type === "call"
      ) {
        api.sendMessage(
          "📞 Call Event Detected!\n\nCheck Railway/Console Log.",
          event.threadID
        );
      }

    } catch (err) {
      console.error("[CALLWELCOME]", err);
    }
  }
};
