const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require('../../config.json');
const database = require("../utils/database");
const generateGoodbyeCard = require("../utils/goodbyecardgenerator");

module.exports = {
  config: {
    name: "goodbye",
    eventType: ["log:unsubscribe"],
    version: "2.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const { threadID } = event;
    if (!threadID) return;

    let thread = null;
    try {
      thread = await threadsData.getThread(threadID);
    } catch (err) {
      console.error("[GOODBYE] getThread ERROR:", err?.message || err);
    }

    const groupName = thread?.name || "Unknown Group";

    // AntiLeave চালু থাকলে Goodbye message পাঠাবে না
    if (
      thread &&
      (thread.antileave === true ||
        thread.antiLeave === true ||
        thread.settings?.antileave === true ||
        thread.settings?.antiLeave === true ||
        (thread.data && (thread.data.antileave === true || thread.data.antiLeave === true)))
    ) {
      return;
    }

    const leftParticipantID = String(event.logMessageData?.leftParticipantFbId || "");
    if (!leftParticipantID) return;

    let leftParticipantName = `User ${leftParticipantID.slice(-4)}`;
    try {
      const user = await database.getUser(leftParticipantID);
      if (user?.name) leftParticipantName = user.name;
    } catch (err) {
      // Fallback name already set above
    }

    // Try getUserInfo from api as additional fallback
    if (leftParticipantName.startsWith("User ")) {
      try {
        if (typeof api.getUserInfo === "function") {
          const info = await api.getUserInfo(leftParticipantID);
          if (info?.[leftParticipantID]?.name) {
            leftParticipantName = info[leftParticipantID].name;
          }
        }
      } catch (err) {
        // Keep fallback name
      }
    }

    // ── Resolve "left by" (who removed) ─────────────────────────────────────
    let leftByName = leftParticipantName; // default: self-leave
    const authorId = event.author || event.logMessageData?.actorFbId;
    if (authorId && String(authorId) !== leftParticipantID) {
      try {
        if (typeof api.getUserInfo === "function") {
          const aInfo = await api.getUserInfo(authorId);
          leftByName = aInfo?.[authorId]?.name || leftByName;
        }
      } catch (err) {
        // Keep fallback
      }
    }

    // ── Resolve total member count & group avatar ────────────────────────────
    let totalMembers = "N/A";
    let groupAvatarUrl = null;
    try {
      if (typeof api.getThreadInfo === "function") {
        const tInfo = await api.getThreadInfo(threadID);
        if (Array.isArray(tInfo?.participantIDs)) {
          totalMembers = String(tInfo.participantIDs.length);
        } else if (Array.isArray(tInfo?.userInfo)) {
          totalMembers = String(tInfo.userInfo.length);
        }
        groupAvatarUrl =
          tInfo?.imageSrc ||
          tInfo?.image?.uri ||
          tInfo?.groupImageSrc ||
          null;
      }
    } catch (err) {
      console.error("[GOODBYE] getThreadInfo ERROR:", err?.message || err);
    }

    // ── Member profile picture ───────────────────────────────────────────────
    const memberAvatarUrl = leftParticipantID
      ? `https://graph.facebook.com/${leftParticipantID}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`
      : null;

    // ── Text message (Bangla — unchanged) ───────────────────────────────────
    const msg = `╭━━━〔 🥀 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 🥀 〕━━━╮

◈ ━━━━━━ ⸙ ━━━━━━ ◈

⚡ 𝗠𝗘𝗠𝗕𝗘𝗥: ◤ ${leftParticipantName} ◢ 🔥

⚛️ 𝗚𝗥𝗢𝗨𝗣: ◤ ${groupName} ◢ ❄️

◈ ━━━━━━ ⸙ ━━━━━━ ◈

❤️‍🩹 যদি কখনো আবার ফিরে আসতে মন চায়, তবে নির্দ্বিধায় আমাদের ইনবক্সে একটি মেসেজ দিয়ো। 📩

🔥 আমরা তোমাকে সাদরে আবারও আমাদের গ্রুপে অ্যাড করে নেবো। 🤝✨

🍃 ভালো থেকো, নিজের খেয়াল রেখো সবসময়। 💫

🤍 আল্লাহ হাফেজ! 🌸

✨ আবার দেখা হবে, শুভকামনা রইল! 🎉

╰━━〔 ⚡ 𝐒𝐄𝐄 𝐘𝐎𝐔 𝐒𝐎𝐎𝐍 ⚡ 〕━━╯`;

    // ── Generate goodbye card image ──────────────────────────────────────────
    let imagePath = null;
    try {
      const buffer = await generateGoodbyeCard({
        memberName:      leftParticipantName,
        userId:          leftParticipantID,
        groupName:       groupName,
        leftBy:          leftByName,
        leftOn:          new Date(),
        totalMembers:    totalMembers,
        memberAvatarUrl: memberAvatarUrl,
        groupAvatarUrl:  groupAvatarUrl,
      });

      imagePath = path.join(
        os.tmpdir(),
        `goodbye_${threadID}_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`
      );
      fs.writeFileSync(imagePath, buffer);
    } catch (err) {
      console.error("[GOODBYE] Card generation ERROR:", err?.stack || err);
    }

    // ── Send message (card + text together) ─────────────────────────────────
    try {
      if (imagePath && fs.existsSync(imagePath)) {
        await api.sendMessage(
          {
            body: msg,
            attachment: fs.createReadStream(imagePath),
            mentions: [{
              id: leftParticipantID,
              tag: leftParticipantName
            }]
          },
          threadID
        );
      } else {
        // Card failed — fall back to text only
        await api.sendMessage(
          {
            body: msg,
            mentions: [{
              id: leftParticipantID,
              tag: leftParticipantName
            }]
          },
          threadID
        );
      }
    } catch (err) {
      console.error("[GOODBYE] sendMessage ERROR:", err?.message || err);
    } finally {
      // Cleanup temp file
      if (imagePath) {
        fs.unlink(imagePath, () => {});
      }
    }
  }
};
