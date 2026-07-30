// দুইটা leave event খুব কাছাকাছি সময়ে এলে যাতে duplicate processing না হয়,
// তার জন্য একটা ছোট in-memory lock রাখা হলো।
const processingLocks = new Set();

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

module.exports = {
  config: {
    name: "antileave",
    version: "2.0.0",
    author: "Riyad Bot",
    eventType: ["log:unsubscribe"]
  },

  onStart: async function ({ api, event }) {
    if (event.logMessageType !== "log:unsubscribe") return;

    const threadID = String(event.threadID);
    const leftUserID = String(event.logMessageData.leftParticipantFbId);
    const authorID = String(event.author || "");

    // শুধুমাত্র নিজে Leave করলে কাজ করবে (কাউকে kick করলে antileave কাজ করবে না)
    if (leftUserID !== authorID) return;

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

    // একই ইউজার/থ্রেড এর জন্য একই সাথে দুইবার প্রসেস না হয় তার জন্য lock
    const lockKey = `${threadID}_${leftUserID}`;
    if (processingLocks.has(lockKey)) {
      console.log(`[ANTILEAVE] Skipping duplicate event for ${lockKey}`);
      return;
    }
    processingLocks.add(lockKey);
    setTimeout(() => processingLocks.delete(lockKey), 60000); // ৬০ সেকেন্ড পর lock রিসেট

    console.log("[ANTILEAVE] Detected self-leave:", leftUserID, "in", threadID);

    // Facebook-এর প্রসেস শেষ হওয়ার জন্য একটু অপেক্ষা
    await sleep(5000);

    // ================= লাইভ গ্রুপ তথ্য চেক =================
    // DB-এর উপর নির্ভর না করে সরাসরি Facebook থেকে fresh তথ্য আনা হচ্ছে,
    // কারণ approvalMode / adminIDs সঠিকভাবে কাজ না করলে re-add ব্যর্থ হয়
    // অথবা "pending approval"-এ আটকে থাকে অথচ বট ভুলভাবে সফল বলে জানায়।
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

    // বট Admin না থাকলে এবং approval mode চালু থাকলে re-add ব্যর্থ/pending হওয়ার
    // সম্ভাবনা অনেক বেশি — এটাই সেই কারণ যার জন্য কিছু কিছু গ্রুপে কাজ করে না
    if (approvalMode && !botIsAdmin) {
      console.log(`[ANTILEAVE] Group ${threadID}: approvalMode ON & bot is not admin — re-add may just queue for approval.`);
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
          await sleep(6000); // দ্বিতীয়বার চেষ্টার আগে একটু বেশি সময় দেওয়া
        }
      }
    }

    if (!added) {
      console.error("[ANTILEAVE] All attempts failed for", leftUserID, "in", threadID);

      let reason = extractErrorMessage(lastError);
      if (!botIsAdmin) {
        reason += "\n\n👉 সম্ভাব্য কারণ: বট এই গ্রুপে Admin/Moderator না। বটকে Admin বানালে এই সমস্যা সাধারণত ঠিক হয়ে যায়।";
      }

      await api.sendMessage(
        `❌ AntiLeave Failed\n\n${reason}`,
        threadID
      );
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

    // approval mode চালু আর বট admin না থাকলে সাথে সাথে গ্রুপে ঢুকবে না,
    // admin approval লাগবে — তাই মেসেজ সেই অনুযায়ী পাল্টানো হলো
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
      await api.sendMessage({
        body,
        mentions: [
          {
            id: leftUserID,
            tag: userName
          }
        ]
      }, threadID);
    } catch (err) {
      console.error("[ANTILEAVE] Failed to send confirmation message:", extractErrorMessage(err));
    }
  }
};
