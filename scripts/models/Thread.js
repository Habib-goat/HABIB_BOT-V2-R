const mongoose = require("mongoose");

const threadSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      default: "Group Thread"
    },

    prefix: {
      type: String,
      default: null
    },

    settings: {
      antiSpam: {
        type: Boolean,
        default: true
      },

      antiLink: {
        type: Boolean,
        default: false
      },

      antiBadword: {
        type: Boolean,
        default: false
      },

      autoReply: {
        type: Boolean,
        default: true
      },

      noPrefix: {
  type: Boolean,
  default: false
},

      protect: {
  enable: {
    type: Boolean,
    default: false
  },

  name: {
    type: String,
    default: ""
  },

  emoji: {
    type: String,
    default: ""
  },

  color: {
    type: String,
    default: ""
  },

  nickname: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  imageSrc: {
    type: String,
    default: ""
  }
},

welcomeMessage: {
  type: String,
  default: "Welcome {name} to our group!"
},

      goodbyeMessage: {
        type: String,
        default: "{name} has left the group."
      }
    },

    members: {
      type: [
        {
          userID: {
            type: String,
            required: true
          },
          name: {
            type: String,
            default: ""
          },
          inGroup: {
            type: Boolean,
            default: true
          },
          isAdmin: {
            type: Boolean,
            default: false
          }
        }
      ],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Thread", threadSchema);
