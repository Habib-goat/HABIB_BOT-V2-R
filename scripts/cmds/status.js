/**
 * @file status.js
 * @description Gemini AI দিয়ে বাংলা স্ট্যাটাস/উক্তি জেনারেট করার Messenger কমান্ড
 * @credits Riyad
 * @dependencies @google/genai
 * @license MIT
 */

const { GoogleGenAI } = require("@google/genai");

const CATEGORY_PROMPTS = {
  islamic:
    "তুমি একজন বাংলা স্ট্যাটাস লেখক। আমাকে ইসলাম ধর্ম সম্পর্কিত (কুরআন/হাদিসের ভাবার্থ, ধৈর্য, দোয়া, তাকওয়া বিষয়ক) একটি অনুপ্রেরণামূলক বাংলা স্ট্যাটাস দাও। শুধু স্ট্যাটাসটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
  valobasha:
    "তুমি একজন বাংলা স্ট্যাটাস লেখক। আমাকে ভালোবাসা নিয়ে একটি হৃদয়স্পর্শী রোমান্টিক বাংলা স্ট্যাটাস দাও। শুধু স্ট্যাটাসটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
  kosto:
    "তুমি একজন বাংলা স্ট্যাটাস লেখক। আমাকে কষ্ট/দুঃখ/বিরহ নিয়ে একটি আবেগঘন বাংলা স্ট্যাটাস দাও। শুধু স্ট্যাটাসটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
  hasi:
    "তুমি একজন বাংলা স্ট্যাটাস লেখক। আমাকে হাসি/আনন্দ/জীবনকে উপভোগ করা নিয়ে একটি মজার বা ইতিবাচক বাংলা স্ট্যাটাস দাও। শুধু স্ট্যাটাসটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
  attitude:
    "তুমি একজন বাংলা স্ট্যাটাস লেখক। আমাকে attitude/আত্মবিশ্বাস/নিজের উপর বিশ্বাস নিয়ে একটি শক্তিশালী বাংলা স্ট্যাটাস দাও। শুধু স্ট্যাটাসটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।"
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

const EMOJI_MAP = {
  islamic: "🕌",
  valobasha: "❤️",
  kosto: "😔",
  hasi: "😄",
  attitude: "🔥"
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
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota exceeded") ||
    message.includes("NOT_FOUND")
  );
}

function cleanQuote(text) {
  return String(text || "")
    .trim()
    .replace(/^["'*`]+|["'*`]+$/g, "")
    .trim();
}

module.exports = {
  config: {
    name: "status",
    aliases: ["quote", "ukti"],
    version: "2.1.0",
    author: "Riyad",
    countDown: 8,
    role: 0,
    category: "ai",
    description: "Gemini AI দিয়ে বাংলা স্ট্যাটাস জেনারেট করে",
    guide:
      "{pn} <islamic|valobasha|kosto|hasi|attitude>\nউদাহরণ: {pn} valobasha"
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

    const input = String(args[0] || "").toLowerCase();
    const category = ALIASES_MAP[input];

    if (!category) {
      return api.sendMessage(
        "❌ | সঠিক ক্যাটাগরি দিন:\nislamic, valobasha, kosto, hasi, attitude\n\nউদাহরণ: status valobasha",
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
        try {
          // ai.js-এ কাজ করা সর্বশেষ alias ব্যবহার করা হচ্ছে।
          // gemini-2.5-flash নতুন ইউজারদের জন্য 404 দেয়।
          const ai = new GoogleGenAI({ apiKey });

          result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: CATEGORY_PROMPTS[category]
          });

          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableGeminiError(error)) {
            throw error;
          }
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
          "❌ | কোনো স্ট্যাটাস পাওয়া যায়নি, আবার চেষ্টা করুন।",
          threadID,
          messageID
        );
      }

      if (hasReaction) {
        api.setMessageReaction("✅", messageID, () => {}, true);
      }

      return api.sendMessage(
        `${EMOJI_MAP[category]} | ${quote}`,
        threadID,
        messageID
      );
    } catch (error) {
      console.error(
        "status error:",
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
