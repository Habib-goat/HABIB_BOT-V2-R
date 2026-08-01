const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

function fmtTime(ts) {
  const d = new Date(Number(ts));
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Downloads the first forwardable attachment (image/video/audio) so it
// can be re-sent to other threads. Riyad Bot has no getStreamsFromAttachment
// helper, so we do it manually here.
async function downloadAttachment(attachment) {
  const cacheDir = path.join(process.cwd(), "cache");
  fs.ensureDirSync(cacheDir);

  const url = attachment.url || attachment.previewUrl;
  if (!url) return null;

  const ext = attachment.type === "video" ? "mp4" : attachment.type === "audio" ? "mp3" : "png";
  const filePath = path.join(cacheDir, `sendnoti_${Date.now()}.${ext}`);

  const res = await axios({ url, method: "GET", responseType: "arraybuffer" });
  fs.writeFileSync(filePath, Buffer.from(res.data));

  return filePath;
}

module.exports = {
  config: {
    name: "sendnoti",
    aliases: ["gnoti"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 0,
    category: "box chat",
    guide: {
      en: "{pn} create <groupName>: create a new notification group\n"
        + "  Example: {pn} create TEAM1\n\n"
        + "{pn} add <groupName>: add the current box chat to notification group <groupName> (you must be group admin here)\n"
        + "  Example: {pn} add TEAM1\n\n"
        + "{pn} list: show notification groups you manage\n\n"
        + "{pn} info <groupName>: view info of notification group <groupName>\n\n"
        + "{pn} delete <groupName>: remove the current box chat from notification group <groupName>\n"
        + "  Example: {pn} delete TEAM1\n\n"
        + "{pn} send <groupName> | <message>: send a notification to every group in <groupName>\n"
        + "  Example: {pn} send TEAM1 | Hello everyone!\n\n"
        + "{pn} remove <groupName>: delete notification group <groupName> entirely"
    },
    description: {
      en: "Create and send notifications to groups you manage."
    }
  },

  onStart: async function ({ api, event, args, usersData }) {
    const { threadID, messageID, senderID } = event;

    const user = await usersData.getUser(senderID);
    let groupsSendNoti = user.groupsSendNoti || [];

    const reply = (text) => api.sendMessage(text, threadID, messageID);
    const save = () => usersData.updateUser(senderID, { groupsSendNoti });

    switch (args[0]) {
      case "create": {
        const groupName = args.slice(1).join(" ");
        if (!groupName) return reply("⚠️ | Please enter a groupNoti name.");

        if (groupsSendNoti.some(item => item.groupName === groupName)) {
          return reply(`⚠️ | You already created a notification group named "${groupName}", please choose another name.`);
        }

        const groupID = Date.now();
        groupsSendNoti.push({ groupName, groupID, threadIDs: [] });
        await save();

        return reply(`✅ | Created notification group successfully:\n- Name: ${groupName}\n- ID: ${groupID}`);
      }

      case "add": {
        const groupName = args.slice(1).join(" ");
        if (!groupName) return reply("⚠️ | Please enter the groupNoti name you want to add this box chat to.");

        const getGroup = groupsSendNoti.find(item => item.groupName === groupName);
        if (!getGroup) return reply(`⚠️ | You don't manage any notification group named "${groupName}".`);

        if (!event.isGroupAdmin) {
          return reply("❌ | You must be an admin of this group chat to add it.");
        }

        if (!getGroup.threadIDs.includes(threadID)) {
          getGroup.threadIDs.push(threadID);
          await save();
        }

        return reply(`✅ | Added this group chat to notification group: ${groupName}`);
      }

      case "list": {
        if (!groupsSendNoti.length) return reply("⚠️ | You haven't created/managed any notification group yet.");

        const msg = groupsSendNoti
          .map(item => `+ ${item.groupName} - ${item.threadIDs.length}`)
          .join("\n");

        return reply(`📋 | Notification groups you manage:\n${msg}`);
      }

      case "delete": {
        const groupName = args.slice(1).join(" ");
        if (!groupName) return reply("⚠️ | Please enter the groupNoti name you want to remove this box chat from.");

        const getGroup = groupsSendNoti.find(item => item.groupName === groupName);
        if (!getGroup) return reply(`⚠️ | You don't manage any notification group named "${groupName}".`);

        const idx = getGroup.threadIDs.findIndex(id => id === threadID);
        if (idx === -1) return reply(`⚠️ | This group chat is not in notification group "${groupName}".`);

        getGroup.threadIDs.splice(idx, 1);
        await save();

        return reply(`✅ | Removed this group chat from notification group: ${groupName}`);
      }

      case "remove":
      case "-r": {
        const groupName = args.slice(1).join(" ");
        if (!groupName) return reply("⚠️ | Please enter the groupNoti name you want to delete.");

        const idx = groupsSendNoti.findIndex(item => item.groupName === groupName);
        if (idx === -1) return reply(`⚠️ | You don't manage any notification group named "${groupName}".`);

        groupsSendNoti.splice(idx, 1);
        await save();

        return reply(`✅ | Deleted notification group: ${groupName}`);
      }

      case "send": {
        const rawArgs = args.slice(1).join(" ");
        const [groupNamePart, ...rest] = rawArgs.split("|");
        const groupName = groupNamePart.trim();
        const messageBody = rest.join("|").trim();

        if (!groupName) return reply("⚠️ | Please enter the groupNoti name you want to send a message to.");

        const getGroup = groupsSendNoti.find(item => item.groupName === groupName);
        if (!getGroup) return reply(`⚠️ | You don't manage any notification group named "${groupName}".`);
        if (!getGroup.threadIDs.length) return reply(`⚠️ | Notification group "${groupName}" has no group chats yet.`);

        const formSend = { body: messageBody };
        let downloadedPath = null;

        try {
          const attachments = [
            ...(event.attachments || []),
            ...(event.messageReply?.attachments || [])
          ].filter(a => ["photo", "png", "animated_image", "video", "audio"].includes(a.type));

          if (attachments.length) {
            downloadedPath = await downloadAttachment(attachments[0]);
            if (downloadedPath) formSend.attachment = fs.createReadStream(downloadedPath);
          }
        } catch (err) {
          // continue without attachment if download fails
        }

        const sendingMsg = await api.sendMessage(
          `⏳ | Sending notification to ${getGroup.threadIDs.length} group chats...`,
          threadID,
          messageID
        );

        const success = [];
        const failed = [];

        for (const tid of getGroup.threadIDs) {
          await new Promise(r => setTimeout(r, 1000));

          try {
            const threadInfo = await api.getThreadInfo(tid);
            const adminIDs = (threadInfo.adminIDs || []).map(a => String(a.id || a));

            if (!adminIDs.includes(String(senderID))) {
              failed.push({ threadID: tid, threadName: threadInfo.threadName, error: "PERMISSION_DENIED" });
              continue;
            }

            await api.sendMessage(formSend, tid);
            success.push({ threadID: tid, threadName: threadInfo.threadName });
          } catch (err) {
            failed.push({ threadID: tid, threadName: "Unknown", error: err.message });
          }
        }

        try {
          if (sendingMsg?.messageID) await api.unsendMessage(sendingMsg.messageID);
        } catch (_) {}

        if (downloadedPath) {
          try { fs.unlinkSync(downloadedPath); } catch (_) {}
        }

        let resultMsg = "";
        if (success.length) resultMsg += `✅ | Sent notification to ${success.length} group chats in "${groupName}" successfully\n`;
        if (failed.length) {
          resultMsg += `❌ | Failed to send to ${failed.length} group chats:\n`;
          resultMsg += failed
            .map(item => `- ID: ${item.threadID}\n  Name: ${item.threadName}\n  Reason: ${item.error === "PERMISSION_DENIED" ? "You are not admin of this group" : item.error}`)
            .join("\n");
        }

        return reply(resultMsg);
      }

      case "info": {
        const groupName = args.slice(1).join(" ");
        if (!groupName) return reply("⚠️ | Please enter the groupNoti name you want to view.");

        const getGroup = groupsSendNoti.find(item => item.groupName === groupName);
        if (!getGroup) return reply(`⚠️ | You don't manage any notification group named "${groupName}".`);

        let msg = "";
        for (const tid of getGroup.threadIDs) {
          let threadName = "Unknown";
          try {
            const info = await api.getThreadInfo(tid);
            threadName = info.threadName || info.name || "Unknown";
          } catch (_) {}
          msg += ` + ID: ${tid}\n + Name: ${threadName}\n\n`;
        }

        return reply(
          `- Group Name: ${getGroup.groupName}\n`
          + `- ID: ${getGroup.groupID}\n`
          + `- Created at: ${fmtTime(getGroup.groupID)}\n`
          + (msg ? `- Has group chats:\n${msg}` : `- No group chats in "${groupName}" yet.`)
        );
      }

      default:
        return reply(
          "⚠️ | Wrong syntax. Use:\n"
          + "sendnoti create <name>\n"
          + "sendnoti add <name>\n"
          + "sendnoti list\n"
          + "sendnoti info <name>\n"
          + "sendnoti delete <name>\n"
          + "sendnoti send <name> | <message>\n"
          + "sendnoti remove <name>"
        );
    }
  }
};
