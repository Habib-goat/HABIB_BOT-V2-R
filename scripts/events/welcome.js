const config = require('../../config.json');

module.exports = {
  config: {
    name: "welcome",
    eventType: ["log:subscribe"],
    version: "1.1.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!Array.isArray(addedParticipants) || addedParticipants.length === 0) return;

    // FIXED: was missing `await` — getThread returns a Promise
    let thread = null;
    try {
      thread = await threadsData.getThread(threadID);
    } catch (err) {
