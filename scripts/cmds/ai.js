/**
 * @file ai.js
 * @description Gemini AI Assistant Command for Facebook Messenger Bot
 * @credits Riyad
 * @dependencies @google/genai
 * @license MIT
 */

// ১. গুগল-এর সর্বশেষ অফিসিয়াল GenAI SDK ইমপোর্ট করুন
const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");

module.exports = {
  config: {
    name: "ai",
    version: "1.0.0",
    hasPermission: 0,
    credits: "Riyad",
    description: "গুগল-এর শক্তিশালী Gemini AI কে যেকোনো প্রশ্ন জিজ্ঞাসা করুন।",
    commandCategory: "AI Chat",
    usages: "[আপনার প্রশ্নটি লিখুন]",
    cooldowns: 5
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    // ২. কোনো প্রশ্ন না দিলে সঠিক ব্যবহারের নিয়ম জানিয়ে দেওয়া
    if (args.length === 0) {
      return api.sendMessage(
        "❌ অনুগ্রহ করে আপনার প্রশ্নটি লিখুন।\n\nব্যবহারের নিয়ম: /ai [আপনার প্রশ্ন]\nউদাহরণ: /ai সালোকসংশ্লেষ কি?",
        threadID,
        messageID
      );
    }

    const prompt = args.join(" ");
    const replied = event.messageReply;

let imageBase64 = null;

if (
  replied &&
  replied.attachments &&
  replied.attachments.length &&
  replied.attachments[0].type === "photo"
) {
  const imageUrl = replied.attachments[0].url;

  const imageResponse = await axios.get(imageUrl, {
    responseType: "arraybuffer"
  });

  imageBase64 = Buffer.from(imageResponse.data).toString("base64");
}

    // ৩. বট চিন্তা করছে - এটি ইউজারকে জানানো
    const processingMessageID = await new Promise((resolve) => {
      api.sendMessage("🔍 একটু অপেক্ষা করুন, আমি ভাবছি...", threadID, (err, info) => {
        if (!err && info && info.messageID) {
          resolve(info.messageID);
        } else {
          resolve(null);
        }
      }, messageID);
    });

    try {
      // ৪. এনভায়রনমেন্ট ভ্যারিয়েবল থেকে API কী নেওয়া
      const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
].filter(Boolean);

if (!apiKeys.length) {
  throw new Error("No Gemini API Key found.");
}

      // ৬. সর্বশেষ এবং দ্রুততম 'gemini-2.5-flash' মডেল দিয়ে কনটেন্ট জেনারেট করা
      let response;
let lastError;

for (const apiKey of apiKeys) {
  try {
    const ai = new GoogleGenAI({ apiKey });

    if (imageBase64) {
  response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
  {
    parts: [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      },
      {
        text: prompt
      }
    ]
  }
]
  });
} else {
  response = await ai.models.generateContent({
  model: "gemini-flash-latest",
  contents: [
    {
      parts: [
        {
          text: prompt
        }
      ]
    }
  ]
});
}

    break;

  } catch (err) {
    lastError = err;

    const msg = String(err.message || "");

    if (
      err.status === 429 ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("Quota exceeded") ||
      err.status === 404 ||
      msg.includes("NOT_FOUND")
    ) {
      continue;
    }

    throw err;
  }
}

if (!response) {
  throw lastError;
}

      const replyText =
  response.text ||
  response.candidates?.[0]?.content?.parts
    ?.map(part => part.text)
    .filter(Boolean)
    .join("\n");

if (!replyText) {
  throw new Error("Gemini AI থেকে কোনো উত্তর পাওয়া যায়নি।");
}

      // ৭. 'ভাবছি...' মেসেজটি সরিয়ে উত্তর পাঠিয়ে দেওয়া
      if (processingMessageID) {
        api.unsendMessage(processingMessageID);
      }

      return api.sendMessage(
        `🤖 𝐆𝐞𝐦𝐢𝐧𝐢 𝐀𝐈\n\n${replyText}`,
        threadID,
        messageID
      );

    } catch (error) {
      console.error("Gemini AI Command Error:", error);

      // কোনো ত্রুটি হলে লোডিং মেসেজ ডিলিট করে ইউজারকে ত্রুটির বিবরণ দেওয়া
      if (processingMessageID) {
        api.unsendMessage(processingMessageID);
      }

      return api.sendMessage(
        `❌ দুঃখিত, একটি সমস্যা হয়েছে!\nত্রুটি: ${error.message || "Gemini AI এর সাথে যোগাযোগ করা যায়নি।"}`,
        threadID,
        messageID
      );
    }
  }
};
