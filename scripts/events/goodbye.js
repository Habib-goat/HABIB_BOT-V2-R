const config = require('../../config.json');

module.exports = {
  config: {
    name: "goodbye",
    eventType: ["log:unsubscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType === "log:unsubscribe") {
      const { threadID } = event;
      const thread = threadsData.getThread(threadID);
      
      const leftParticipantID = String(event.logMessageData.leftParticipantFbId);
      const leftParticipantName = event.logMessageData.leftParticipantName || `User ${leftParticipantID.slice(-4)}`;
      
      const msg = (thread.settings.goodbyeMessage || "{name} has left the group.")
        .replace(/{name}/g, leftParticipantName)
        .replace(/{threadName}/g, thread.name);
        
      await api.sendMessage(msg, threadID);
    }
  }
};
