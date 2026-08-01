const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      default: "Unknown User"
    },

    exp: {
      type: Number,
      default: 0
    },

    level: {
      type: Number,
      default: 1
    },

    money: {
      type: Number,
      default: 500
    },

    bank: {
      type: Number,
      default: 0
    },

    lastDaily: {
      type: Number,
      default: 0
    },

    banned: {
      type: Boolean,
      default: false
    },

    inventory: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    // Used by scripts/cmds/sendnoti.js to store each user's
    // notification groups (list of thread IDs they broadcast to).
    groupsSendNoti: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
