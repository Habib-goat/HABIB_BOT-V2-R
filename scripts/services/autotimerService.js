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
"12:00 AM": {
  text: `╭━━━〔 🌙 গভীর রাত 〕━━━╮

🌌 রাতের এই নীরবতা আল্লাহর এক অপূর্ব নিয়ামত।
🤲 একটু জিকির করুন, দোয়া করুন এবং শান্তিতে বিশ্রাম নিন।

﴾ سُبْحَانَ اللّٰهِ وَبِحَمْدِهِ ﴿

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/7ch5ym.mp4"
},

"01:00 AM": {
  text: `╭━━━〔 🌌 রাত ১টা 〕━━━╮

✨ তারাভরা আকাশ সাক্ষী—আল্লাহর সৃষ্টি কত নিখুঁত!
😴 সুস্থ থাকার জন্য এখন বিশ্রাম নিন।

﴾ الْحَمْدُ لِلّٰهِ ﴿

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/rqnlpt.mp4"
},

"02:00 AM": {
  text: `╭━━━〔 🌠 রাত ২টা 〕━━━╮

🍃 প্রকৃতির নীরবতা আমাদের শেখায়,
সব নিয়ামতই মহান আল্লাহর পক্ষ থেকে।

🤲 আলহামদুলিল্লাহ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/ev7guv.mp4"
},

"03:00 AM": {
  text: `╭━━━〔 🌃 রাত ৩টা 〕━━━╮

🌙 রাতের শেষ প্রহর—
আল্লাহকে স্মরণ করার এক সুন্দর সময়।

﴾ أَسْتَغْفِرُ اللّٰهَ ﴿

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/rijx8m.mp4"
},
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

"06:00 AM": {
  text: `╭━━━〔 ☀️ শুভ সকাল 〕━━━╮

🌿 নতুন সূর্যের আলো আল্লাহর অশেষ রহমতের নিদর্শন।
✨ আলহামদুলিল্লাহ বলে দিনটি শুরু হোক।

🤍 আল্লাহ সবাইকে হেফাজত করুন।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/otdztt.mp4"
},

"07:00 AM": {
  text: `╭━━━〔 🌸 সকাল ৭টা 〕━━━╮

🍀 সকালের নির্মল বাতাস,
সবুজ প্রকৃতি আর আল্লাহর অশেষ নিয়ামত।

💚 হাসিমুখে দিন শুরু করুন।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/q6b7fo.mp4"
},

"08:00 AM": {
  text: `╭━━━〔 🌤️ সকাল ৮টা 〕━━━╮

🌱 প্রতিটি নতুন সকাল
আল্লাহর দেওয়া একটি নতুন সুযোগ।

✨ নেক আমলে কাটুক আজকের দিন।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/jxa3ka.mp4"
},

"09:00 AM": {
  text: `╭━━━〔 🌞 সকাল ৯টা 〕━━━╮

🌳 প্রকৃতির সৌন্দর্য দেখুন,
আল্লাহর সৃষ্টি নিয়ে চিন্তা করুন।

🤲 আলহামদুলিল্লাহ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/wtu9vw.mp4"
},

"10:00 AM": {
  text: `╭━━━〔 🌼 সকাল ১০টা 〕━━━╮

🌺 ফুল, আকাশ আর সবুজ পৃথিবী—
সবই মহান আল্লাহর সৃষ্টি।

🤍 শুকরিয়া আল্লাহ।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/guv0tc.mp4"
},

"11:00 AM": {
  text: `╭━━━〔 🌿 সকাল ১১টা 〕━━━╮

🍃 ব্যস্ততার মাঝেও
আল্লাহর অগণিত নিয়ামতের জন্য
শুকরিয়া আদায় করুন।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/aecxiz.mp4"
},

"12:00 PM": {
  text: `╭━━━〔 ☀️ দুপুর ১২টা 〕━━━╮

🌏 সুন্দর এই পৃথিবী
মহান আল্লাহর এক অসীম নিয়ামত।

💚 সবার জন্য দোয়া রইল।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/wrc15v.mp4"
},
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

"02:00 PM": {
  text: `╭━━━〔 🌳 দুপুর ২টা 〕━━━╮

🍃 প্রকৃতির মাঝে কিছুটা সময় কাটান।
🤲 সর্বদা আল্লাহর ওপর ভরসা রাখুন।

﴾ حَسْبُنَا اللَّهُ ﴿

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/vgecfk.mp4"
},

"03:00 PM": {
  text: `╭━━━〔 🌅 বিকেল ৩টা 〕━━━╮

🍂 বিকেলের মৃদু হাওয়া
মনে করিয়ে দেয়—
আল্লাহর প্রতিটি সৃষ্টি সৌন্দর্যময়।

🤍 আলহামদুলিল্লাহ

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/iddna6.mp4"
},

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

"09:00 PM": {
  text: `╭━━━〔 🌙 রাত ৯টা 〕━━━╮

✨ রাতের শান্ত আকাশ
আল্লাহর অসীম মহিমার সাক্ষী।

🤲 আজকের সকল নিয়ামতের জন্য
শুকরিয়া আদায় করুন।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/fpac7y.mp4"
},

"10:00 PM": {
  text: `╭━━━〔 🌌 রাত ১০টা 〕━━━╮

🌠 আল্লাহর হেফাজতের দোয়া করে
শান্তিতে বিশ্রাম নিন।

🤍 শুভ রাত্রি।

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/e7v8en.mp4"
},

"11:00 PM": {
  text: `╭━━━〔 🌃 রাত ১১টা 〕━━━╮

🌙 নীরব রাত, শীতল বাতাস
আর আল্লাহর রহমত।

🤲 আগামী দিনটি হোক
কল্যাণময় ও বরকতময়।

✨ آمين يا رب العالمين ✨

╰━━━━━━━━━━━━━━━━━━━━╯`,
  video: "https://files.catbox.moe/7bas7j.mp4"
},
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
