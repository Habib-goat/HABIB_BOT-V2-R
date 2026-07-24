const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    // Statistics
    totalCommandsExecuted: {
      type: Number,
      default: 0
    },

    blockedUsers: {
      type: Map,
      of: Boolean,
      default: {}
    },

    systemUptimeStart: {
      type: Number,
      default: Date.now
    },

    // Global Bot Configuration
    botName: {
      type: String,
      default: "Riyad Bot"
    },

    prefix: {
      type: String,
      default: "/"
    },

    language: {
      type: String,
      default: "en"
    },

    theme: {
      type: String,
      default: "dark"
    },

    timezone: {
      type: String,
      default: "Asia/Dhaka"
    },

    maintenance: {
      type: Boolean,
      default: false
    },

    restartNotice: {
      type: Boolean,
      default: true
    },

    commandCooldown: {
      type: Number,
      default: 5
    },

    errorLog: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Settings", settingsSchema);
