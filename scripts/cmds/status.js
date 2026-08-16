/**
 * @file status.js
 * @description Gemini AI দিয়ে বাংলা/Banglish/English caption জেনারেট করার Messenger কমান্ড
 * @credits Riyad
 * @dependencies @google/genai
 * @license MIT
 */

const { GoogleGenAI } = require("@google/genai");

const CATEGORY_PROMPTS = {
  islamic:
    "ইসলাম ধর্ম সম্পর্কিত (কুরআন/হাদিসের ভাবার্থ, ধৈর্য, দোয়া, তাকওয়া বিষয়ক) একটি অনুপ্রেরণামূলক caption লেখো। ভুলভাবে কোনো আয়াত বা হাদিসের সূত্র বানাবে না।",
  valobasha:
    "ভালোবাসা নিয়ে একটি হৃদয়স্পর্শী রোমান্টিক caption লেখো।",
  kosto:
    "কষ্ট/দুঃখ/বিরহ নিয়ে একটি আবেগঘন caption লেখো।",
  hasi:
    "হাসি/আনন্দ/জীবনকে উপভোগ করা নিয়ে একটি মজার বা ইতিবাচক caption লেখো।",
  attitude:
    "attitude/আত্মবিশ্বাস/নিজের উপর বিশ্বাস নিয়ে একটি শক্তিশালী caption লেখো।"
};

const ALIASES_MAP = {
  islamic: "islamic",
  islam: "islamic",
  deen: "islamic",
  valobasha: "valobasha",
  love: "valobasha",
  bhalobasha: "valobasha",
  kosto: "kosto",
  sad: "kosto",
  dukkho: "kosto",
  hasi: "hasi",
  funny: "hasi",
  mojar: "hasi",
  attitude: "attitude",
  att: "attitude"
};

const LANGUAGE_MAP = {
  b: "bangla",
  bn: "bangla",
  bangla: "bangla",
  বাংলা: "bangla",
  ba: "banglish",
  banglish: "banglish",
  banglaish: "banglish",
  e: "english",
  en: "english",
  english: "english"
};

const EMOJI_MAP = {
  islamic: "🕌",
  valobasha: "❤️",
  kosto: "😔",
  hasi: "😄",
  attitude: "🔥"
};

const LANGUAGE_NAMES = {
  bangla: "শুদ্ধ বাংলায়",
  banglish: "বাংলা শব্দের ইংরেজি অক্ষরের Banglish-এ",
  english: "English ভাষায়"
};

function getApiKeys() {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3
  ].filter(Boolean);
}

function isRetryableGeminiError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.status === 429 ||
    error?.status === 404 ||
    error?.status === 503 ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota exceeded") ||
    message.includes("NOT_FOUND") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanQuote(text) {
  return String(text || "")
    .trim()
    .replace(/^["'*`“”]+|["'*`“”]+$/g, "")
    .replace(/^(caption|quote|উক্তি|স্ট্যাটাস)\s*:\s*/i, "")
    .trim();
}

function toBoldUnicode(text) {
  return Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0);

      if (code >= 0x41 && code <= 0x5a) {
        return String.fromCodePoint(0x1d400 + (code - 0x41));
      }

      if (code >= 0x61 && code <= 0x7a) {
        return String.fromCodePoint(0x1d41a + (code - 0x61));
      }

      if (code >= 0x30 && code <= 0x39) {
        return String.fromCodePoint(0x1d7ce + (code - 0x30));
      }

      return character;
    })
    .join("");
}

function formatCaption(text, category) {
  const caption = cleanQuote(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  const styledCaption = toBoldUnicode(caption);
  const emoji = EMOJI_MAP[category];

  // Caption ছাড়া কোনো explanatory text নয়—শুধু হালকা decorative symbol এবং emoji।
  return `✦ ${emoji} ${styledCaption} ✦`;
}

module.exports = {
  config: {
    name: "caption",
    aliases: ["status", "quote", "ukti"],
    version: "3.0.0",
    author: "Riyad",
    countDown: 8,
    role: 0,
    category: "ai",
    description: "Gemini AI দিয়ে বাংলা, Banglish ও English caption জেনারেট করে",
    guide:
      "{pn} <b|ba|e> <islamic|valobasha|kosto|hasi|attitude>\nউদাহরণ: {pn} b islamic"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const hasReaction = typeof api.setMessageReaction === "function";
    const apiKeys = getApiKeys();

    if (!apiKeys.length) {
      return api.sendMessage(
        "❌ | GEMINI_API_KEY সেট করা নেই (.env ফাইলে যোগ করুন)।",
        threadID,
        messageID
      );
    }

    const firstInput = String(args[0] || "").toLowerCase();
    const secondInput = String(args[1] || "").toLowerCase();
    const isLegacyFormat = !secondInput && Boolean(ALIASES_MAP[firstInput]);
    const languageInput = isLegacyFormat ? "b" : firstInput;
    const categoryInput = isLegacyFormat ? firstInput : secondInput;
    const language = LANGUAGE_MAP[languageInput];
    const category = ALIASES_MAP[categoryInput];

    if (!language || !category) {
      return api.sendMessage(
        "❌ | ব্যবহার করুন:\ncaption b islamic\ncaption ba islamic\ncaption e islamic",
        threadID,
        messageID
      );
    }

    try {
      if (hasReaction) {
        api.setMessageReaction("⏳", messageID, () => {}, true);
      }

      let result;
      let lastError;

      for (const apiKey of apiKeys) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `${CATEGORY_PROMPTS[category]}

ভাষা: ${LANGUAGE_NAMES[language]}

কঠোর নিয়ম:
1. শুধু caption-এর text দেবে—কোনো ভূমিকা, ব্যাখ্যা, title, label, language name, hashtag বা অতিরিক্ত কথা দেবে না।
2. quotation mark, markdown, bullet, "Caption:" বা "Here is" লিখবে না।
3. ১-৩টি ছোট লাইনে, স্বাভাবিক এবং share করার মতো caption দেবে।
4. caption-এর ভেতরে ১-৩টি মানানসই emoji এবং খুব হালকা decorative symbol রাখবে।
5. English/Banglish হলে Latin অক্ষরে লিখবে।`;

            // ai.js-এ ব্যবহার করা একই working model alias রাখা হয়েছে।
            result = await ai.models.generateContent({
              model: "gemini-flash-latest",
              contents: prompt
            });

            break;
          } catch (error) {
            lastError = error;
            if (!isRetryableGeminiError(error)) {
              throw error;
            }

            // 503 high-demand হলে একই মডেলে পুনরায় চেষ্টা করার আগে বিরতি।
            if (attempt < 2) {
              await sleep(1200 * (attempt + 1));
            }
          }
        }

        if (result) {
          break;
        }
      }

      if (!result) {
        throw lastError || new Error("Gemini API থেকে কোনো উত্তর পাওয়া যায়নি।");
      }

      const quote = cleanQuote(result.text);

      if (!quote) {
        if (hasReaction) {
          api.setMessageReaction("❌", messageID, () => {}, true);
        }
        return api.sendMessage(
          "❌ | কোনো caption পাওয়া যায়নি, আবার চেষ্টা করুন।",
          threadID,
          messageID
        );
      }

      if (hasReaction) {
        api.setMessageReaction("✅", messageID, () => {}, true);
      }

      return api.sendMessage(
        formatCaption(quote, category),
        threadID,
        messageID
      );
    } catch (error) {
      console.error(
        "caption error:",
        error?.response?.data || error?.message || error
      );

      if (hasReaction) {
        api.setMessageReaction("❌", messageID, () => {}, true);
      }

      return api.sendMessage(
        `❌ | Gemini API error: ${
          error?.message || "Gemini AI এর সাথে যোগাযোগ করা যায়নি।"
        }`,
        threadID,
        messageID
      );
    }
  }
};
