module.exports = {
  config: {
    name: "ping",
    aliases: ["latency"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 2,
    role: 0,
    category: "system",
    guide: {
      en: "{pn}"
    },
    description: {
      en: "Check bot responsiveness and system state."
    }
  },

  onStart: async function({ api, event, message }) {
    const start = Date.now();
    const tempMsg = await api.sendMessage("Checking ping...", event.threadID);
    const latency = Date.now() - start;
    await api.sendMessage(`Pong! 🏓 Latency: ${latency}ms\nSystem is fully online and responsive.`, event.threadID);
  }
};
