const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "protect",
    version: "1.2",
    author: "MOHAMMAD AKASH",
    role: 2,
    shortDescription: "Lock group name, nickname, theme, emoji",
    category: "group",
    guide: "{pn} on/off"
  },

  onStart: async ({ api, event, message, threadsData, args }) => {
  console.log("ARGS =", args);
  console.log("BODY =", event.body);

  const { threadID } = event;

    if (!args[0]) {
  return api.sendMessage(
    "⚠️ Usage: /protect on | /protect off",
    threadID
  );
}
    
    if (args[0] === "on") {
      const info = await api.getThreadInfo(threadID);
      console.log("Saved imageSrc:", info.imageSrc);
console.log("THREAD INFO:");
  console.log(JSON.stringify(info, null, 2));
      console.log("IMAGE FIELDS:", {
  imageSrc: info.imageSrc,
  imageID: info.imageID,
  image: info.image,
  threadPicture: info.threadPicture,
  groupPhoto: info.groupPhoto
});
      const protectData = {
  enable: true,
  name: info.threadName || "",
  emoji: info.emoji || "",
  color: info.color || "",
  imageSrc: info.imageSrc || "",
  nickname: {}
};

      // Safely handle members
      const members = info.members || [];
      members.forEach(u => {
        protectData.nickname[u.userID] = u.nickname || "";
      });

      const thread = await threadsData.getThread(threadID) || {};

await threadsData.updateThread(threadID, {
  settings: {
    ...(thread.settings || {}),
    protect: protectData
  }
});

const check = await threadsData.getThread(threadID);
console.log(
  "CHECK PROTECT:",
  JSON.stringify(check.settings?.protect, null, 2)
);

return api.sendMessage(
  "🛡 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n✨ Name, Nickname, Theme & Emoji are now LOCKED!",
  threadID
);
    }

    if (args[0] === "off") {
      const thread = await threadsData.getThread(threadID);

await threadsData.updateThread(threadID, {
  settings: {
    ...thread.settings,
    protect: {
      enable: false
    }
  }
});
      return api.sendMessage(
  "🔓 𝗣𝗥𝗢𝗧𝗘𝗖𝗧 𝗗𝗜𝗦𝗔𝗕𝗟𝗘𝗗\n💥 All locks are now OFF!",
  threadID
);
    }
  },

  onEvent: async ({ api, event, threadsData }) => {
  try {
    console.log("PROTECT EVENT:", event.logMessageType);

    const { threadID, author, logMessageType, logMessageData } = event;
    const thread = await threadsData.getThread(threadID);

if (!thread) return;

const protectData = thread.settings?.protect;

if (!protectData?.enable) return;

if (logMessageType === "log:thread-image") {
  console.log("Stored imageSrc:", protectData.imageSrc);

  if (protectData.imageSrc) {
    const filePath = path.join(__dirname, `protect_${threadID}.jpg`);

    console.log("Downloading image...");

    const response = await axios({
      url: protectData.imageSrc,
      method: "GET",
      responseType: "stream"
    });

    const writer = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("Downloaded.");
    console.log("Calling changeGroupImage...");

    await api.changeGroupImage(
      fs.createReadStream(filePath),
      threadID
    );

    console.log("changeGroupImage success!");

    fs.unlinkSync(filePath);
  }
}

            if (logMessageType === "log:user-nickname") {
        const { participant_id } = logMessageData;
        await api.changeNickname(
          protectData.nickname[participant_id] || "",
          threadID,
          participant_id
        );
      }

  } catch (err) {
    console.error("PROTECT ERROR:", err);
    console.error(err.stack);
  }
}
};
