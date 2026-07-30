const config = require('../../config.json');
const database = require("../utils/database");

module.exports = {
  config: {
    name: "goodbye",
    eventType: ["log:unsubscribe"],
    version: "1.1.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    let thread = null;
    try {
      thread = await threadsData.getThread(threadID);
    } catch (err) {
      console.error("[GOODBYE] getThread ERROR:", err?.message || err);
    }

    const groupName = thread?.name || "Unknown Group";

    // AntiLeave চালু থাকলে Goodbye message পাঠাবে না
