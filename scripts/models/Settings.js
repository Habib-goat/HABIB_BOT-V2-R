const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
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
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Settings", settingsSchema);
