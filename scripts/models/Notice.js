const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    text: {
      type: String,
      default: ""
    },

    mention: {
      type: Boolean,
      default: false
    },

    image: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Notice", noticeSchema);
