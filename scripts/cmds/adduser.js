module.exports = {
  config: {
    name: "adduser",
    version: "1.5.0",
    author: "NTKhang (Converted & Fixed)",
    countDown: 5,
    role: 1,
    description: "Add a member to the chat group using Facebook Link or UID.",
    category: "box chat",
    guide: "{pn} [Facebook Link | User ID]"
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, messageID } = event;
    
    // FRAMEWORK-COMPATIBLE BOT ID RESOLUTION (Fixes 'api.getCurrentUserID is not a function')
    let botID = "";
    try {
      if (api.getCurrentUserID && typeof api.getCurrentUserID === "function") {
        botID = api.getCurrentUserID();
      } else {
        botID = api.getCurrentUserID || api.botID || "";
      }
    } catch (e) {
      botID = api.getCurrentUserID || "";
    }

    if (args.length === 0) {
      return api.sendMessage("⚠️ Please enter a Facebook profile link or User ID to add.\nExample: adduser 100000000000000", threadID, messageID);
    }

    let threadInfo;
    try {
      threadInfo = await threadsData.getThread(threadID) || {};
    } catch (err) {
      threadInfo = {};
    }

    const adminIDs = threadInfo.adminIDs || [];
    const approvalMode = threadInfo.approvalMode || false;
    const members = threadInfo.members || [];

    const success = [];
    const waitApproval = [];
    const failed = [];

    const regExMatchFB = /(?:https?:\/\/)?(?:www\.)?(?:facebook|fb|m\.facebook)\.(?:com|me)\/([a-zA-Z0-9.]+)/i;

    for (const item of args) {
      let uid = item;

      if (isNaN(item) && regExMatchFB.test(item)) {
        const idParamMatch = item.match(/[?&]id=(\d+)/) || item.match(/profile\.php\?id=(\d+)/);
        if (idParamMatch) {
          uid = idParamMatch[1];
        } else {
          failed.push({ item: item, reason: "Converting custom FB Links to UID requires 'global.utils' which is removed. Please use direct numeric UID." });
          continue;
        }
      }

      if (isNaN(uid)) {
        failed.push({ item: item, reason: "Invalid UID format. Please use a direct numeric ID." });
        continue;
      }

      const isAlreadyMember = members.some(m => m.userID == uid && m.inGroup);
      if (isAlreadyMember) {
        failed.push({ item: item, reason: "This user is already in this group." });
        continue;
      }

      try {
        await api.addUserToGroup(uid, threadID);
        if (approvalMode === true && !adminIDs.includes(botID)) {
          waitApproval.push(uid);
        } else {
          success.push(uid);
        }
      } catch (err) {
        failed.push({ item: item, reason: "The bot is blocked from adding, or user privacy settings prevent strangers from adding them." });
      }
    }

    let msg = "";
    if (success.length > 0) {
      msg += "✅ Successfully added " + success.length + " member(s) to the group.\n";
    }
    if (waitApproval.length > 0) {
      msg += "⏳ Added " + waitApproval.length + " member(s) to the approval queue.\n";
    }
    if (failed.length > 0) {
      msg += "❌ Failed to add some member(s):\n" + failed.map(f => "  • " + f.item + ": " + f.reason).join("\n");
    }

    return api.sendMessage(msg.trim() || "⚠️ No action was taken.", threadID, messageID);
  }
};
