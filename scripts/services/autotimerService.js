const moment = require("moment-timezone");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

let api = null;
let started = false;
let interval = null;

// Runtime configuration
const runtime = {
  enabledThreads: new Map(),
  sentMap: new Map()
};

// 24-hour timer data
const timerData = {
  "12:00 AM": { text: "⌚┆এখন রাত ১২টা বাজে❥︎খাউয়া দাউয়া করে নেউ,🍽️🍛", video: "https://files.catbox.moe/8btwbx.mp4" },
  "01:00 AM": { text: "⌚┆এখন রাত ১টা বাজে❥︎সবাই শুয়ে পড়ো,🌌💤", video: "https://files.catbox.moe/9iq1ki.mp4" },
  "02:00 AM": { text: "⌚┆এখন রাত ২টা বাজে❥︎প্রেম না কইরা যাইয়া ঘুমা বেক্কল,😾🌠", video: "https://files.catbox.moe/g9zf5c.mp4" },
  "03:00 AM": { text: "⌚┆এখন রাত ৩টা বাজে❥︎যারা ছ্যাকা খাইছে তারা জেগে আছে,🫠🌃", video: "https://files.catbox.moe/siojtf.mp4" },
  "04:30 AM": {
  text: `╭━━━〔 🌅 𝐅𝐀𝐉𝐑 • ফজরের সময় 〕━━━╮

﴾ ﷽ ﴿

اَلصَّلَاةُ خَيْرٌ مِّنَ النَّوْمِ

🤲 আর কিছুক্ষণ পর ফজরের নামাজের সময় হবে।
🕌 সবাই অজু করে নামাজের জন্য প্রস্তুতি নিন।

اللَّهُمَّ اجْعَلْنَا مِنَ الْمُقِيمِينَ لِلصَّلَاةِ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/ee9khu.mp4"
},
  "05:00 AM": { text: "⌚┆এখন সকাল ৫টা বাজে❥︎নামাজ পড়ছো তো?🌅☀️", video: "https://files.catbox.moe/5v4nxi.mp4" },
  "06:00 AM": { text: "⌚┆এখন সকাল ৬টা বাজে❥︎ঘুম থেকে উঠো সবাই,🌞☕", video: "https://files.catbox.moe/q9rf0f.mp4" },
  "07:00 AM": { text: "⌚┆এখন সকাল ৭টা বাজে❥︎ব্রেকফাস্ট করে নাও,🍞", video: "https://files.catbox.moe/ztnm6a.mp4" },
  "08:00 AM": { text: "⌚┆এখন সকাল ৮টা বাজে❥︎কাজ শুরু করো মন দিয়ে,🌤️✨", video: "https://files.catbox.moe/tb5xef.mp4" },
  "09:00 AM": { text: "⌚┆এখন সকাল ৯টা বাজে❥︎চল কাজে মন দিই!🕘", video: "https://files.catbox.moe/2mi5oo.mp4" },
  "10:00 AM": { text: "⌚┆এখন সকাল ১০টা বাজে❥︎তোমাদের মিস করছি,🌞☀️", video: "https://files.catbox.moe/q2vg9i.mp4" },
  "11:00 AM": { text: "⌚┆এখন সকাল ১১টা বাজে❥︎কাজ চালিয়ে যাও!😌", video: "https://files.catbox.moe/zzm2xo.mp4" },
  "12:00 PM": { text: "⌚┆এখন দুপুর ১২টা বাজে❥︎ভালোবাসা জানাও সবাইকে,❤️", video: "https://files.catbox.moe/g8d1av.mp4" },
  "01:00 PM": {
  text: `╭━━━〔 🕌 𝐙𝐔𝐇𝐑 • যোহরের সময় 〕━━━╮

﴾ ﷽ ﴿

حَيَّ عَلَى الصَّلَاةِ

🤲 আর কিছুক্ষণ পর যোহরের নামাজের সময় হবে।
🕌 সবাই নামাজের জন্য প্রস্তুতি নিন।

رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/c5qbek.mp4"
},
  "02:00 PM": { text: "⌚┆এখন দুপুর ২টা বাজে❥︎দুপুরের খাবার খেয়েছো তো?🍛🌤️", video: "https://files.catbox.moe/nstu8b.mp4" },
  "03:00 PM": { text: "⌚┆এখন বিকাল ৩টা বাজে❥︎কাজে ফোকাস করো,🧑‍🔧☀️", video: "https://files.catbox.moe/xmrujv.mp4" },
  "04:30 PM": {
  text: `╭━━━〔 🕌 𝐀𝐒𝐑 • আসরের সময় 〕━━━╮

﴾ ﷽ ﴿

إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَوْقُوتًا

🤲 আর কিছুক্ষণ পর আসরের নামাজের সময় হবে।
🕌 সবাই নামাজের জন্য প্রস্তুতি নিন।

اللَّهُمَّ تَقَبَّلْ مِنَّا

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/vcgbxq.mp4"
},
  "05:00 PM": { text: "⌚┆এখন বিকাল ৫টা বাজে❥︎একটু বিশ্রাম নাও,🙂↕️🌆", video: "https://files.catbox.moe/dv3qv4.mp4" },
  "06:30 PM": {
  text: `╭━━━〔 🌇 𝐌𝐀𝐆𝐇𝐑𝐈𝐁 • মাগরিবের সময় 〕━━━╮

﴾ ﷽ ﴿

الله أكبر، الله أكبر

🤲 আর কিছুক্ষণ পর মাগরিবের নামাজের সময় হবে।
🕌 সবাই অজু করে নামাজের জন্য প্রস্তুতি নিন।

اللَّهُمَّ تَقَبَّلْ مِنَّا

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/y8pnz7.mp4"
},
  "07:00 PM": { text: "⌚┆এখন সন্ধ্যা ৭টা বাজে❥︎এশার নামাজ পড়ো,❤️🌃", video: "https://files.catbox.moe/4v4uyv.mp4" },
  "08:00 PM": {
  text: `╭━━━〔 🌙 𝐈𝐒𝐇𝐀 • এশার সময় 〕━━━╮

﴾ ﷽ ﴿

بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ

🤲 আর কিছুক্ষণ পর এশার নামাজের সময় হবে।
🕌 সবাই নামাজের জন্য প্রস্তুতি নিন।

آمِين يَا رَبَّ الْعَالَمِينَ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/rpnut9.mp4"
},
  "09:00 PM": { text: "⌚┆এখন রাত ৯টা বাজে❥︎ঘুমের প্রস্তুতি নাও,😴🌙", video: "https://files.catbox.moe/sxs5io.mp4" },
  "10:00 PM": { text: "⌚┆এখন রাত ১০টা বাজে❥︎ঘুমাতে যাও, স্বপ্নে দেখা হবে,😴🙂↕️", video: "https://files.catbox.moe/0e4s7h.mp4" },
  "11:00 PM": { text: "⌚┆এখন রাত ১১টা বাজে❥︎ভালোবাসা রইলো,🥰🌌", video: "https://files.catbox.moe/ndbhtu.mp4" }
};
// Cache folder
const cacheDir = path.join(process.cwd(), "cache", "autotimer");

function ensureCache() {
  fs.ensureDirSync(cacheDir);
}

// Inject Messenger API after login
function setApi(messengerApi) {
  api = messengerApi;
}

// Enable / Disable per thread
function setThreadStatus(threadID, status) {
  runtime.enabledThreads.set(String(threadID), !!status);
}

function getThreadStatus(threadID) {
  if (!runtime.enabledThreads.has(String(threadID)))
    return true; // default ON
  return runtime.enabledThreads.get(String(threadID));
}

async function checkAndSend() {
  if (!api) return;

  try {
    const now = moment().tz("Asia/Dhaka").format("hh:mm A");
    const today = moment().tz("Asia/Dhaka").format("DD-MM-YYYY");

    const data = timerData[now];
    if (!data) return;

    const sentKey = `${today}_${now}`;

    // Prevent duplicate execution in the same minute
    if (runtime.sentMap.has(sentKey))
      return;

    runtime.sentMap.set(sentKey, true);

    // Remove old cache keys
    if (runtime.sentMap.size > 100) {
      runtime.sentMap.clear();
    }

    const videoFile = path.join(
      cacheDir,
      now.replace(/[: ]/g, "_") + ".mp4"
    );

    // Download video if not cached
if (!fs.existsSync(videoFile)) {
  try {
    const response = await axios.get(data.video, {
      responseType: "arraybuffer",
      timeout: 30000
    });

    // Ensure cache directory exists
    fs.ensureDirSync(path.dirname(videoFile));

    fs.writeFileSync(videoFile, Buffer.from(response.data));
  } catch (err) {
    console.error("[AutoTimer] Video download failed:", err.message);
    return;
  }
}

    const messageBody =
`╔══════════════════╗
        ⏰ 𝐀𝐔𝐓𝐎 𝐓𝐈𝐌𝐄𝐑⏰
╠══════════════════╣

🕒 𝐓𝐈𝐌𝐄 ➜ ${now}
📅 𝐃𝐀𝐓𝐄 ➜ ${today}

┏━━━━━━━━━━━━━━━━━━┓
${data.text}
┗━━━━━━━━━━━━━━━━━━┛

       _—_⚡𝐑𝐈𝐘𝐀𝐃 𝐁𝐎𝐓⚡_—_
╚═══════════════════╝`;


    // Get all group threads
const threads = typeof api.getThreadList === "function"
      ? await api.getThreadList(1000, null, ["INBOX"])
      : [];

if (!Array.isArray(threads)) return;

const groups = threads.filter(
  t => t.isGroup && t.isSubscribed
);

for (const thread of groups) {
  const threadID = String(thread.threadID);

  if (!getThreadStatus(threadID))
    continue;

  try {
    const info = await api.sendMessage(
  {
    body: messageBody,
    attachment: fs.createReadStream(videoFile)
  },
  threadID
);
    
console.log("[AUTOTIMER MESSAGE]", info);
    
if (info && info.messageID) {
  const reactionManager = require("../reactions/reactionManager");

  reactionManager.register(info.messageID, {
    commandName: "__global__"
  });
}
  } catch (err) {
    console.error(
      `[AutoTimer] Failed to send message to ${threadID}:`,
      err.message
    );
  }
}

  } catch (err) {
    console.error("[AutoTimer]", err);
  }
}

async function start() {
  if (started) return;

  started = true;
  ensureCache();

  interval = setInterval(checkAndSend, 30 * 1000);

  console.log("[AutoTimer] Service started successfully.");
}
function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    started = false;
  }
}
module.exports = {
  start,
  stop,
  setApi,
  setThreadStatus,
  getThreadStatus
};
