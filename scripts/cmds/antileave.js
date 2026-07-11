/**
 * @file antileave.js
 * @description Anti-Leave command and event handler for custom Riyad Bot Framework.
 * @author AI Coding Agent
 * @license Apache-2.0
 */

module.exports = {
  config: {
    name: "antileave",
    version: "1.0.0",
    role: 1, // Admin only by default to toggle (0 = All, 1 = Admins, 2 = Thread Owners)
    credits: "Riyad Bot Framework",
    description: "টগল করুন এবং গ্রুপ থেকে চলে যাওয়া মেম্বারকে পুনরায় যুক্ত করার চেষ্টা করুন।",
    category: "group",
    usages: "/antileave on/off",
    countdlDowns: 5,
  },

  onStart: async function ({ api, event, args, threadsData, usersData }) {
    const { threadID, messageID } = event;

    // Check if the trigger is a log event (someone leaving the group)
    if (event.type === "event" && event.logMessageType === "log:unsubscribe") {
      try {
        const leftUserId = event.logMessageData.leftParticipantFbId;
        if (!leftUserId) return;

        const botID = api.getCurrentUserID ? api.getCurrentUserID() : null;
        // Ignore if the bot itself is leaving or removed
        if (botID && leftUserId === botID) return;

        // Fetch thread settings using threadsData.getThread
        let threadInfo = await threadsData.getThread(threadID);
        if (!threadInfo) threadInfo = {};

        // Check if anti-leave is enabled for this thread
        const isEnabled = (threadInfo.antileave === true) || 
                          (threadInfo.data && threadInfo.data.antileave === true);

        if (!isEnabled) return;

        // Prevent duplicate events within a short timeframe (10 seconds)
        if (!global.recentLeaves) {
          global.recentLeaves = new Map();
        }
        const cacheKey = `${threadID}_${leftUserId}`;
        const now = Date.now();
        if (global.recentLeaves.has(cacheKey) && (now - global.recentLeaves.get(cacheKey) < 10000)) {
          return;
        }
        global.recentLeaves.set(cacheKey, now);

        // Get group name
        let groupName = "আমাদের গ্রুপ";
        if (threadInfo.threadName) {
          groupName = threadInfo.threadName;
        } else {
          try {
            const tInfo = await new Promise((resolve) => {
              if (typeof api.getThreadInfo === "function") {
                api.getThreadInfo(threadID, (err, info) => {
                  resolve(err ? null : info);
                });
              } else {
                resolve(null);
              }
            });
            if (tInfo && tInfo.threadName) {
              groupName = tInfo.threadName;
            }
          } catch (e) {
            // silent catch
          }
        }

        // Get the leaving member's name
        let name = "";
        if (usersData && typeof usersData.getNameUser === "function") {
          try {
            name = await usersData.getNameUser(leftUserId);
          } catch (e) {}
        }
        if (!name && usersData && typeof usersData.getUser === "function") {
          try {
            const u = await usersData.getUser(leftUserId);
            if (u && u.name) name = u.name;
          } catch (e) {}
        }
        if (!name) {
          try {
            const userInfo = await new Promise((resolve) => {
              api.getUserInfo(leftUserId, (err, info) => {
                resolve(err ? null : info);
              });
            });
            if (userInfo && userInfo[leftUserId]) {
              name = userInfo[leftUserId].name;
            }
          } catch (e) {}
        }
        if (!name) {
          name = "গ্রুপের সদস্য";
        }

        // Format Bengali Date and Time (Asia/Dhaka timezone)
        let dateTime = "";
        try {
          const dateObj = new Date();
          const dateStr = dateObj.toLocaleDateString("bn-BD", {
            timeZone: "Asia/Dhaka",
            day: "numeric",
            month: "long",
            year: "numeric"
          });
          const timeStr = dateObj.toLocaleTimeString("bn-BD", {
            timeZone: "Asia/Dhaka",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
          });
          dateTime = `${dateStr} | ${timeStr}`;
        } catch (e) {
          dateTime = new Date().toLocaleString();
        }

        // Attempt to re-add the member
        let addSuccess = false;
        try {
          if (typeof api.addUserToGroup === "function") {
            await new Promise((resolve, reject) => {
              api.addUserToGroup(leftUserId, threadID, (err) => {
                if (err) reject(err);
                else resolve(true);
              });
            });
            addSuccess = true;
          }
        } catch (err) {
          addSuccess = false;
        }

        // Generate the gorgeous Bengali messages
        let messageText = "";
        if (addSuccess) {
          messageText = 
            `╔═══════════════════════════╗\n` +
            `  🔴 ANTILEAVE EVENT DETECTED\n` +
            `╚═══════════════════════════╝\n` +
            `👤 সদস্য: ${name}\n` +
            `📌 গ্রুপ: ${groupName}\n` +
            `🕒 সময়: ${dateTime}\n` +
            `───────────────────────────\n` +
            `😢 প্রিয় ${name}, আপনি গ্রুপ ত্যাগ করেছেন। আমাদের কাছে আপনি অত্যন্ত গুরুত্বপূর্ণ।\n\n` +
            `🔄 সম্ভব হলে আপনাকে পুনরায় গ্রুপে যুক্ত করার চেষ্টা করা হয়েছে এবং তা সফল হয়েছে! আমরা আশা করি আপনি আমাদের সাথেই থাকবেন। ❤️\n` +
            `───────────────────────────`;
        } else {
          messageText = 
            `╔═══════════════════════════╗\n` +
            `  🔴 ANTILEAVE EVENT DETECTED\n` +
            `╚═══════════════════════════╝\n` +
            `👤 সদস্য: ${name}\n` +
            `📌 গ্রুপ: ${groupName}\n` +
            `🕒 সময়: ${dateTime}\n` +
            `───────────────────────────\n` +
            `😢 প্রিয় ${name}, আপনি গ্রুপ ত্যাগ করেছেন। আমাদের কাছে আপনি অত্যন্ত গুরুত্বপূর্ণ।\n\n` +
            `⚠️ আমরা আপনাকে পুনরায় গ্রুপে যুক্ত করার চেষ্টা করেছি, কিন্তু কিছু ফেসবুক বা এপিআই সীমাবদ্ধতার কারণে সরাসরি যুক্ত করা সম্ভব হয়নি। আমরা আশা করি আপনি আমাদের সাথেই থাকবেন এবং শীঘ্রই নিজে থেকে গ্রুপে ফিরে আসবেন। ❤️\n` +
            `───────────────────────────`;
        }

        // Send the message using api.sendMessage()
        if (typeof api.sendMessage === "function") {
          api.sendMessage(messageText, threadID);
        }
      } catch (error) {
        console.error("Error in anti-leave event handling:", error);
      }
      return;
    }

    // Otherwise, handle as a toggle command
    try {
      const input = args[0] ? args[0].toLowerCase() : "";

      if (input === "on") {
        let threadInfo = await threadsData.getThread(threadID);
        if (!threadInfo) threadInfo = {};
        if (!threadInfo.data) threadInfo.data = {};

        // Save enabled state per group
        threadInfo.antileave = true;
        threadInfo.data.antileave = true;
        await threadsData.updateThread(threadID, threadInfo);

        return api.sendMessage(
          "╭───────────────⚡\n" +
          "│  🟢 ANTILEAVE ENABLED\n" +
          "├───────────────\n" +
          "│ এন্টি-লিভ সফলভাবে চালু করা হয়েছে।\n" +
          "│ এখন থেকে কোনো সদস্য গ্রুপ লিভ নিলে\n" +
          "│ তাকে পুনরায় যুক্ত করার চেষ্টা করা হবে।\n" +
          "╰────────────────❤️",
          threadID,
          messageID
        );
      } else if (input === "off") {
        let threadInfo = await threadsData.getThread(threadID);
        if (!threadInfo) threadInfo = {};
        if (!threadInfo.data) threadInfo.data = {};

        // Save disabled state per group
        threadInfo.antileave = false;
        threadInfo.data.antileave = false;
        await threadsData.updateThread(threadID, threadInfo);

        return api.sendMessage(
          "╭───────────────⚡\n" +
          "│  🔴 ANTILEAVE DISABLED\n" +
          "├───────────────\n" +
          "│ এন্টি-লিভ সফলভাবে বন্ধ করা হয়েছে।\n" +
          "╰────────────────❤️",
          threadID,
          messageID
        );
      } else {
        // Show status and usage guide
        let threadInfo = await threadsData.getThread(threadID);
        const currentState = (threadInfo && (threadInfo.antileave === true || (threadInfo.data && threadInfo.data.antileave === true))) 
          ? "🟢 চালু আছে (ON)" 
          : "🔴 বন্ধ আছে (OFF)";

        return api.sendMessage(
          "╭═══════════════════════════╮\n" +
          "       🛡️ ANTILEAVE SETTINGS\n" +
          "╰═══════════════════════════╯\n" +
          "ℹ️ বর্তমান অবস্থা: " + currentState + "\n" +
          "───────────────────────────\n" +
          "⚙️ ব্যবহার বিধি:\n" +
          " 👉 /antileave on  - এন্টি-লিভ চালু করুন\n" +
          " 👉 /antileave off - এন্টি-লিভ বন্ধ করুন\n" +
          "───────────────────────────\n" +
          "😢 কোনো মেম্বার লিভ নিলে তাকে আবার\n" +
          " যুক্ত করার চেষ্টা করবে এবং নোটিফিকেশন\n" +
          " সেন্ড করবে।\n" +
          "═════════════════════════════",
          threadID,
          messageID
        );
      }
    } catch (error) {
      console.error("Error in anti-leave command execution:", error);
      api.sendMessage("❌ এন্টি-লিভ কমান্ডটি রান করার সময় একটি ত্রুটি ঘটেছে!", threadID, messageID);
    }
  }
};
