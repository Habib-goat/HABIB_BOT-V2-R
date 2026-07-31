const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateWelcomeCard } = require("../utils/welcomeCardGenerator");

module.exports = {
  config: {
    name: "memberWelcome",
    eventType: ["log:subscribe"],
    version: "2.0.0",
    author: "Riyad Bot"
  },

  onStart: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID, author } = event;
    if (!threadID) return;

    const addedParticipants = event.logMessageData?.addedParticipants;
    if (!Array.isArray(addedParticipants)) return;

    const botID =
      typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : "";

    // ---- Resolve group name -------------------------------------------
    let groupName = "Group Chat";
    let memberCount = null;

    try {
      if (typeof api.getThreadInfo === "function") {
        const info = await api.getThreadInfo(threadID);
        groupName = info?.threadName || info?.name || groupName;
        if (Array.isArray(info?.participantIDs)) {
          memberCount = info.participantIDs.length;
        } else if (Array.isArray(info?.userInfo)) {
          memberCount = info.userInfo.length;
        }
      } else {
        const threadInfo = await threadsData.getThread(threadID);
        groupName = threadInfo?.name || groupName;
      }
    } catch (err) {
      console.error("[WELCOME] getThreadInfo ERROR:", err?.message || err);
      try {
        const threadInfo = await threadsData.getThread(threadID);
        groupName = threadInfo?.name || groupName;
      } catch (err2) {
        console.error("[WELCOME] threadsData ERROR:", err2?.message || err2);
      }
    }

    // ---- Resolve "added by" name ---------------------------------------
    let addedByName = "Unknown";
    try {
      if (author && typeof api.getUserInfo === "function") {
        const info = await api.getUserInfo(author);
        addedByName = info?.[author]?.name || addedByName;
      }
    } catch (err) {
      console.error("[WELCOME] getUserInfo(author) ERROR:", err?.message || err);
    }

    // ---- Send a card for each new (non-bot) member ---------------------
    for (const participant of addedParticipants) {
      if (botID && String(participant.userFbId) === botID) continue;

      const memberName = participant.fullName || "New Member";
      const memberUid = String(participant.userFbId || "");

      // Try to get a high-resolution profile picture. Plain
      // "graph.facebook.com/{uid}/picture" calls (with no access token) are
      // frequently rejected/blocked by Facebook, which is why the avatar
      // wasn't showing up at all. scripts/cmds/pp.js already solves this
      // exact problem — reuse the same working URL pattern (public app
      // access_token + a large size for HD quality).
      let avatarUrl = memberUid
        ? `https://graph.facebook.com/${memberUid}/picture?height=1500&width=1500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`
        : null;
      let avatarFallbackUrl = null;
      try {
        if (typeof api.getUserInfo === "function") {
          const info = await api.getUserInfo(participant.userFbId);
          avatarFallbackUrl =
            info?.[participant.userFbId]?.thumbSrc ||
            info?.[participant.userFbId]?.profileUrl ||
            null;
        }
      } catch (err) {
        console.error("[WELCOME] getUserInfo(member) ERROR:", err?.message || err);
      }
      if (!avatarUrl) avatarUrl = avatarFallbackUrl;
      if (!avatarUrl && participant.profileURL) avatarUrl = participant.profileURL;

      let imagePath = null;
      try {
        const buffer = await generateWelcomeCard({
          memberName,
          groupName,
          userId: memberUid,
          addedBy: addedByName,
          avatarUrl,
          avatarFallbackUrl: avatarUrl !== avatarFallbackUrl ? avatarFallbackUrl : null,
          totalMembers: memberCount !== null ? memberCount : undefined
          // themeSeed omitted -> a random one of the 4 designs is picked
        });

        imagePath = path.join(
          os.tmpdir(),
          `welcome_${threadID}_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`
        );
        fs.writeFileSync(imagePath, buffer);
      } catch (err) {
        console.error("[WELCOME] Card generation ERROR:", err?.stack || err);
      }

      const caption =
`‎      •❅─────── ❖ ───────❅•
‎◄​🌿🌸 𓆩 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗧𝗢 𓆪 🌸🌿►
‎ ◄🌿🌸 𓆩 𝗢𝗨𝗥 𝗚𝗥𝗢𝗨𝗣 𓆪 🌸🌿►
‎      •❅─────── ❖ ───────❅•

‎​✦ ─ ❖《 ${memberName} 》❖ ─ ✦

‎​🌿 𝐆𝐫𝐨𝐮𝐩:  𓆩 ${groupName} 𓆪
‎🌿 𝐌𝐞𝐦𝐛𝐞𝐫:  𓆩 ${memberCount !== null ? memberCount : "N/A"} 𓆪
‎🌿 𝐀𝐝𝐝𝐞𝐝 𝐁𝐘:  𓆩 ${addedByName} 𓆪

‎♛【​•═════════════════•】♛`;

      try {
        if (imagePath && fs.existsSync(imagePath)) {
          await Promise.resolve(
            api.sendMessage(
              { body: caption, attachment: fs.createReadStream(imagePath) },
              threadID
            )
          );
        } else {
          await Promise.resolve(api.sendMessage(caption, threadID));
        }
      } catch (err) {
        console.error("[WELCOME] sendMessage ERROR:", err?.stack || err);
      } finally {
        if (imagePath) {
          fs.unlink(imagePath, () => {});
        }
      }
    }
  }
};
