const fs = require("fs");
const path = require("path");

const ENV_CONFIG = {
  autoUnsend: true,
  sendNoti: true,
  timeToUnsend: 10
};

async function resolveGroupName(api, threadID, threadsData) {
  let groupName = "Unknown Group";
  try {
    const thread = await api.getThreadInfo(threadID);
    if (thread?.threadName) return thread.threadName;
  } catch (_) {}
  try {
    const thread = await threadsData.getThread(threadID);
    if (thread) groupName = thread.threadName || thread.name || groupName;
  } catch (_) {}
  return groupName;
}

async function resolveUserName(api, userID, usersData) {
  if (!userID) return "Unknown User";
  try {
    const info = await api.getUserInfo(userID);
    if (info?.[userID]?.name) return info[userID].name;
  } catch (_) {}
  try {
    const user = await usersData.getUser(userID);
    if (user?.name) return user.name;
  } catch (_) {}
  return "Unknown User";
}

module.exports = {
  config: {
    name: "adminUpdate",
    version: "2.4.78",
    author: "Riyad",
    eventType: [
      "log:thread-admins",
      "log:user-nickname",
      "log:thread-name",
      "log:thread-icon",
      "log:thread-call",
      "log:thread-color",
      "log:magic-words",
      "log:thread-poll",
      "log:thread-approval-mode",
      "log:unsubscribe"
    ]
  },

  onStart: async function ({ api, event, threadsData, usersData }) {
    const { logMessageType, logMessageData, threadID, author } = event;

    if (!threadID) return;

    let threadData;
    try {
      threadData = await threadsData.getThread(threadID);
      if (threadData?.settings?.sendGcNoti === false) return;
    } catch (err) {
      return;
    }

    try {
      const groupName = await resolveGroupName(api, threadID, threadsData);
      let message = "";

      switch (logMessageType) {
        case "log:thread-admins": {
          const targetName = await resolveUserName(api, logMessageData.TARGET_ID, usersData);
          const actorName = await resolveUserName(api, author, usersData);

          if (logMessageData.ADMIN_EVENT == "add_admin") {
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n👑 ${targetName} is now an admin\n✨ Promoted by: ${actorName}`;
          } else if (logMessageData.ADMIN_EVENT == "remove_admin") {
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n🚫 ${targetName} has been removed as admin\n✨ By: ${actorName}`;
          }
          break;
        }

        case "log:user-nickname": {
          const actorName = await resolveUserName(api, author, usersData);
          const targetName = await resolveUserName(api, logMessageData.participant_id, usersData);
          const nicknameText = (!logMessageData.nickname || logMessageData.nickname.length === 0)
            ? `Removed nickname for ${targetName}`
            : `Changed ${targetName}'s nickname to: ${logMessageData.nickname}`;
          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n✏️ ${nicknameText}\n✨ Changed by: ${actorName}`;
          break;
        }

        case "log:thread-name": {
          const actorName = await resolveUserName(api, author, usersData);
          const nameText = logMessageData.name
            ? `Updated group name to: ${logMessageData.name}`
            : "Removed group name";
          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n📝 ${nameText}\n✨ Changed by: ${actorName}`;
          break;
        }

        case "log:thread-icon": {
          const actorName = await resolveUserName(api, author, usersData);
          const dataDir = path.join(__dirname, "data");
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          const iconPath = path.join(dataDir, "emoji.json");

          if (!fs.existsSync(iconPath)) fs.writeFileSync(iconPath, JSON.stringify({}));

          let preIcon = {};
          try { preIcon = JSON.parse(fs.readFileSync(iconPath, "utf8")); } catch (_) {}
          const previousIcon = preIcon[threadID] || "unclear";

          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n🎨 Icon changed (was: ${previousIcon})\n✨ Changed by: ${actorName}`;

          preIcon[threadID] = logMessageData.thread_icon || "👍";
          fs.writeFileSync(iconPath, JSON.stringify(preIcon));
          break;
        }

        case "log:thread-call": {
          if (logMessageData.event == "group_call_started") {
            const callerName = await resolveUserName(api, logMessageData.caller_id, usersData);
            const callType = logMessageData.video ? "VIDEO " : "";
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n📞 ${callerName} started a ${callType}call`;
          } else if (logMessageData.event == "group_call_ended") {
            const callDuration = logMessageData.call_duration || 0;
            let hours = Math.floor(callDuration / 3600);
            let minutes = Math.floor((callDuration - hours * 3600) / 60);
            let seconds = callDuration - hours * 3600 - minutes * 60;
            hours = hours < 10 ? "0" + hours : hours;
            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n📴 Call ended (Duration: ${hours}:${minutes}:${seconds})`;
          } else if (logMessageData.joining_user) {
            const joinerName = await resolveUserName(api, logMessageData.joining_user, usersData);
            const callType = logMessageData.group_call_type == "1" ? "VIDEO " : "";
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n📲 ${joinerName} joined the ${callType}call`;
          }
          break;
        }

        case "log:magic-words": {
          message = `[⚜️] Group: ${groupName}\n[⚜️] Theme ${logMessageData.theme_name} added effects: ${logMessageData.magic_word}\n[⚜️] Emoji: ${logMessageData.emoji_effect || "No emoji"}\n[⚜️] Total ${logMessageData.new_magic_word_count} word effects added`;
          break;
        }

        case "log:thread-poll": {
          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n📊 ${event.logMessageBody}`;
          break;
        }

        case "log:thread-approval-mode": {
          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n✅ ${event.logMessageBody}`;
          break;
        }

        case "log:thread-color": {
          const actorName = await resolveUserName(api, author, usersData);
          message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n🎨 ${(event.logMessageBody || "").replace("Topic", "color")}\n✨ Changed by: ${actorName}`;
          break;
        }

        case "log:unsubscribe": {
          const leftUserID = logMessageData.leftParticipantFbId;
          const leftUserName = await resolveUserName(api, leftUserID, usersData);

          if (String(leftUserID) === String(author)) {
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n🚶 ${leftUserName} left the group.`;
          } else {
            const kickerName = await resolveUserName(api, author, usersData);
            message = `[ GROUP UPDATE ]\n🏡 Group: ${groupName}\n👢 ${leftUserName} was kicked from the group.\n✨ Kicked by: ${kickerName}`;
          }
          break;
        }

        default:
          return;
      }

      if (message && ENV_CONFIG.sendNoti) {
        const sentMsg = await api.sendMessage(message, threadID);

        if (ENV_CONFIG.autoUnsend && sentMsg?.messageID) {
          setTimeout(() => {
            api.unsendMessage(sentMsg.messageID).catch(() => {});
          }, ENV_CONFIG.timeToUnsend * 1000);
        }
      }
    } catch (error) {
      console.error("Error in adminUpdate event:", error);
    }
  }
};
