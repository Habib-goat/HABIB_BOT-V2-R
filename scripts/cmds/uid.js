module.exports = {
  config: {
    name: "uid",
    version: "1.0.1",
    author: "ArYAN (Fixed)",
    description: "Get user ID of yourself, mentioned users, or replied sender.",
    category: "utility",
    cooldowns: 5
  },

  onStart: async function({ api, event }) {
    const { threadID, messageID, messageReply, mentions, senderID } = event;
    let uid;

    if (messageReply) {
      uid = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
      uid = Object.keys(mentions)[0];
    } else {
      uid = senderID;
    }

    try {
      await api.shareContact(`ℹ️ User ID: ${uid}`, uid, threadID, messageID);
    } catch (error) {
      console.warn("api.shareContact failed, falling back to message text:", error.message);
      return api.sendMessage(` ${uid}`, threadID, messageID);
    }
  }
};
