// একদম কাছাকাছি সময়ে (মিলিসেকেন্ডের মধ্যে) একই leave event একাধিকবার এলে
// শুধু সেটা ঠেকানোর জন্য এই ছোট debounce। এটা কখনোই বারবার leave/re-add
// করাকে ব্লক করবে না — প্রতিটা leave-এর জন্য আলাদাভাবে re-add চলবে।
const recentlyProcessed = new Map(); // key -> timestamp
const DEBOUNCE_MS = 4000;

function extractErrorMessage(err) {
  return (
    err?.errorDescription ||
    err?.errorSummary ||
    err?.error ||
    err?.message ||
    (typeof err === "string" ? err : JSON.stringify(err))
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function autoUnsend(api, messageID, delayMs = 7500) {
  if (!messageID || typeof api.unsendMessage !== "function") return;
  setTimeout(() => {
    api.unsendMessage(messageID).catch(() => {});
  }, delayMs);
}

module.exports = {
  config: {
    name: "antileave",
    version: "2.1.1",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);
    const authorID = String(event.author || "");

    // শুধুমাত্র নিজে Leave করলে কাজ করবে (কাউকে kick করলে antileave কাজ করবে না)
    // FIXED: fca-eryxenx মাঝেমধ্যে log:unsubscribe ইভেন্টে `author` ফিল্ড
    // পাঠায় না (খালি থাকে)। আগের কোডে authorID খালি ("") হলেও leftUserID
    // এর সাথে না মেলায় সাথে সাথে return হয়ে যেত — মানে re-add করার
    // চেষ্টাই কখনো হতো না। এখন শুধু তখনই skip করবে যখন author সত্যিই
    // পাওয়া গেছে এবং সেটা leftUserID-এর থেকে আলাদা (অর্থাৎ নিশ্চিতভাবে kick)।
    if (authorID && leftUserID !== authorID) {
      console.log(`[ANTILEAVE] Skipping — ${leftUserID} was kicked by ${authorID}, not a self-leave.`);
      return;
    }

    // বট Leave করলে কিছু করবে না
    let botID = "";
    try {
      botID = typeof api.getCurrentUserID === "function"
        ? String(api.getCurrentUserID())
        : String(api.botID || "");
    } catch {
      botID = String(api.botID || "");
    }

    if (leftUserID === botID) return;

    // ================= শুধু সত্যিকারের duplicate event ঠেকানোর debounce =================
    const lockKey = `${threadID}_${leftUserID}`;
    const now = Date.now();
    const lastTime = recentlyProcessed.get(lockKey);

    if (lastTime && now - lastTime < DEBOUNCE_MS) {
      console.log(`[ANTILEAVE] Ignoring duplicate fired event for ${lockKey} (within ${DEBOUNCE_MS}ms)`);
      return;
    }
    recentlyProcessed.set(lockKey, now);
    // পুরনো entry গুলো মেমোরি থেকে পরিষ্কার রাখতে
    setTimeout(() => {
      if (recentlyProcessed.get(lockKey) === now) {
        recentlyProcessed.delete(lockKey);
      }
    }, DEBOUNCE_MS);

    console.log("[ANTILEAVE] Detected self-leave:", leftUserID, "in", threadID);

    // Facebook-এর প্রসেস শেষ হওয়ার জন্য একটু অপেক্ষা
    await sleep(5000);

    // ================= লাইভ গ্রুপ তথ্য চেক =================
    let approvalMode = false;
    let botIsAdmin = false;

    try {
      if (typeof api.getThreadInfo === "function") {
        const threadInfo = await api.getThreadInfo(threadID);
        approvalMode = Boolean(threadInfo?.approvalMode);

        const adminIDs = (threadInfo?.adminIDs || []).map(
          x => String(x?.id || x)
        );
        botIsAdmin = adminIDs.includes(botID);
      }
    } catch (e) {
      console.log("[ANTILEAVE] getThreadInfo failed, proceeding without it:", e.message);
    }

    // ================= Re-add চেষ্টা (Retry সহ) =================
    const MAX_ATTEMPTS = 2;
    let lastError = null;
    let added = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await api.addUserToGroup(leftUserID, threadID);
        added = true;
        break;
      } catch (err) {
        lastError = err;
        console.error(`[ANTILEAVE] Add attempt ${attempt} failed:`, extractErrorMessage(err));
        if (attempt < MAX_ATTEMPTS) {
          await sleep(6000);
        }
      }
    }

    if (!added) {
      console.error("[ANTILEAVE] All attempts failed for", leftUserID, "in", threadID);

      let reason = extractErrorMessage(lastError);
      if (!botIsAdmin) {
        reason += "\n\n👉 সম্ভাব্য কারণ: বট এই গ্রুপে Admin/Moderator না।";
      }

      try {
        const failMsg = await api.sendMessage(
          `❌ AntiLeave Failed\n\n${reason}`,
          threadID
        );
        autoUnsend(api, failMsg?.messageID);
      } catch (e) {
        console.error("[ANTILEAVE] Could not send failure message:", extractErrorMessage(e));
      }
      return;
    }

    console.log("✅ USER RE-ADDED (or approval requested):", leftUserID);

    let userName = "Member";
    try {
      if (typeof api.getUserInfo === "function") {
        const info = await new Promise((resolve, reject) => {
          api.getUserInfo(leftUserID, (err, data) => {
            if (err) return reject(err);
            resolve(data);
          });
        });

        if (info && info[leftUserID]?.name) {
          userName = info[leftUserID].name;
        }
      }
    } catch (e) {
      console.log("getUserInfo failed:", e.message);
    }

    // approval mode চালু আর বট admin না থাকলে সাথে সাথে গ্রুপে ঢুকবে না
    const needsApproval = approvalMode && !botIsAdmin;

    const body = needsApproval
      ? `╔════════════════════╗
║ 🛡️ ANTI LEAVE 🛡️
╠════════════════════╣

👋 ${userName}

⏳ আপনাকে গ্রুপে ফিরিয়ে আনার জন্য রিকোয়েস্ট পাঠানো হয়েছে।

⚠️ এই গ্রুপে "Membership Approval" চালু থাকায় একজন Admin আপনাকে Approve করলেই আপনি আবার গ্রুপে যুক্ত হবেন।

╚════════════════════╝`
      : `╔════════════════════╗
║ 🛡️ ANTI LEAVE 🛡️
╠════════════════════╣

👋 ${userName}

✅ আপনাকে আবার গ্রুপে যুক্ত করা হয়েছে।

⚠️ গ্রুপ থেকে নিজে বের হওয়া অনুমোদিত নয়।

╚════════════════════╝`;

    try {
      const sentMsg = await api.sendMessage({
        body,
        mentions: [
          {
            id: leftUserID,
            tag: userName
          }
        ]
      }, threadID);

      // ৭.৫ সেকেন্ড পর মেসেজটা auto-unsend হয়ে যাবে
      autoUnsend(api, sentMsg?.messageID);
    } catch (err) {
      console.error("[ANTILEAVE] Failed to send confirmation message:", extractErrorMessage(err));
    }
  }
};
