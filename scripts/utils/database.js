const fs = require('fs-extra');
const path = require('path');

const dbDir = path.join(__dirname, '../../database');
const usersPath = path.join(dbDir, 'users.json');
const threadsPath = path.join(dbDir, 'threads.json');
const settingsPath = path.join(dbDir, 'settings.json');

// Ensure database directory and files exist
fs.ensureDirSync(dbDir);
if (!fs.existsSync(usersPath)) fs.writeJsonSync(usersPath, {});
if (!fs.existsSync(threadsPath)) fs.writeJsonSync(threadsPath, {});
if (!fs.existsSync(settingsPath)) {
  fs.writeJsonSync(settingsPath, {
    totalCommandsExecuted: 0,
    blockedUsers: {},
    systemUptimeStart: Date.now()
  });
}

class Database {
  constructor() {
    this.users = fs.readJsonSync(usersPath);
    this.threads = fs.readJsonSync(threadsPath);
    this.settings = fs.readJsonSync(settingsPath);
  }

  // Save changes to disk
  saveUsers() {
    fs.writeJsonSync(usersPath, this.users, { spaces: 2 });
  }

  saveThreads() {
    fs.writeJsonSync(threadsPath, this.threads, { spaces: 2 });
  }

  saveSettings() {
    fs.writeJsonSync(settingsPath, this.settings, { spaces: 2 });
  }

  // --- Users Methods ---
  getUser(userId) {
    if (!this.users[userId]) {
      const idStr = String(userId);
      this.users[userId] = {
        id: userId,
        name: `User ${idStr.slice(-4)}`,
        exp: 0,
        level: 1,
        money: 500,
        bank: 0,
        lastDaily: 0,
        banned: false,
        inventory: []
      };
      this.saveUsers();
    }
    return this.users[userId];
  }

  updateUser(userId, data) {
    const user = this.getUser(userId);
    this.users[userId] = { ...user, ...data };
    this.saveUsers();
    return this.users[userId];
  }

  getAllUsers() {
    return this.users;
  }

  // --- Threads Methods ---
  getThread(threadId) {
    if (!this.threads[threadId]) {
      const threadIdStr = String(threadId);
      this.threads[threadId] = {
        id: threadId,
        name: `Group Thread ${threadIdStr.slice(-4)}`,
        prefix: null, // Custom prefix for this group
        settings: {
          antiSpam: true,
          antiLink: false,
          antiBadword: false,
          autoReply: true,
          welcomeMessage: "Welcome {name} to our group!",
          goodbyeMessage: "{name} has left the group."
        },
        members: []
      };
      this.saveThreads();
    }
    return this.threads[threadId];
  }

  updateThread(threadId, data) {
    const thread = this.getThread(threadId);
    this.threads[threadId] = { ...thread, ...data };
    this.saveThreads();
    return this.threads[threadId];
  }

  getAllThreads() {
    return this.threads;
  }

  // --- Settings Methods ---
  getSettings() {
    return this.settings;
  }

  updateSettings(data) {
    this.settings = { ...this.settings, ...data };
    this.saveSettings();
    return this.settings;
  }

  incrementCommandCount() {
    this.settings.totalCommandsExecuted = (this.settings.totalCommandsExecuted || 0) + 1;
    this.saveSettings();
  }
}

module.exports = new Database();
