const mongoose = require("mongoose");
const config = require("../../config.json");

const User = require("../models/User");
const Thread = require("../models/Thread");
const Settings = require("../models/Settings");

let isConnected = false;

async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(config.database.uriMongodb);

  isConnected = true;
  console.log("✅ MongoDB Connected");

  return mongoose.connection;
}
async function getUser(userId) {
  await connectDB();

  let user = await User.findOne({ id: String(userId) });

  if (!user) {
    user = await User.create({
      id: String(userId),
      name: `User ${String(userId).slice(-4)}`,
      exp: 0,
      level: 1,
      money: 500,
      bank: 0,
      lastDaily: 0,
      banned: false,
      inventory: []
    });
  }

  return user;
}
async function updateUser(userId, data) {
  await connectDB();

  const user = await getUser(userId);

  Object.assign(user, data);

  await user.save();

  return user;
}
async function getAllUsers() {
  await connectDB();
  return await User.find({});
}
async function getThread(threadId) {
  await connectDB();

  let thread = await Thread.findOne({ id: String(threadId) });

  if (!thread) {
    thread = await Thread.create({
      id: String(threadId),
      name: `Group Thread ${String(threadId).slice(-4)}`,
      prefix: null,
      settings: {
        antiSpam: true,
        antiLink: false,
        antiBadword: false,
        autoReply: true,
        welcomeMessage: "Welcome {name} to our group!",
        goodbyeMessage: "{name} has left the group."
      },
      members: []
    });
  }

  return thread;
}
async function updateThread(threadId, data) {
  await connectDB();

  const thread = await getThread(threadId);

  Object.assign(thread, data);

  await thread.save();

  return thread;
}
async function getAllThreads() {
  await connectDB();
  return await Thread.find({});
}
async function getSettings() {
  await connectDB();

  let settings = await Settings.findOne();

  if (!settings) {
    settings = await Settings.create({
      totalCommandsExecuted: 0,
      blockedUsers: {},
      systemUptimeStart: Date.now()
    });
  }

  return settings;
}
async function updateSettings(data) {
  await connectDB();

  let settings = await getSettings();

  Object.assign(settings, data);

  await settings.save();

  return settings;
}
async function incrementCommandCount() {
  await connectDB();

  const settings = await getSettings();

  settings.totalCommandsExecuted =
    (settings.totalCommandsExecuted || 0) + 1;

  await settings.save();

  return settings.totalCommandsExecuted;
}
module.exports = {
  connectDB,
  getUser,
  updateUser,
  getAllUsers,
  getThread,
  updateThread,
  getAllThreads,
  getSettings,
  updateSettings,
  incrementCommandCount
};
