const config = require('../../config.json');

module.exports = {
  config: {
    name: "welcome",
    eventType: ["log:subscribe"],
    version: "1.0.1",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    // Check if the event type is subscribe
    if (event.logMessageType === "log:subscribe") {
      const { threadID } = event;
const thread = await threadsData.getThread(threadID);

const addedParticipants = event.logMessageData.addedParticipants;

for (const participant of addedParticipants) {
  const name = participant.fullName;

  const msg = (thread?.settings?.welcomeMessage || "🎉 Welcome {name} to {threadName}!")
    .replace(/{name}/g, name)
    .replace(/{threadName}/g, thread?.name || "Group");

  await api.sendMessage(msg, threadID);
}
    }
  }
};
