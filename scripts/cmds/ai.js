/**
 * @file ai.js
 * @description Gemini AI Assistant Command for Facebook Messenger Bot
 * @credits Riyad
 * @dependencies @google/genai
 * @license MIT
 */

// ১. গুগল-এর সর্বশেষ অফিসিয়াল GenAI SDK ইমপোর্ট করুন
const { GoogleGenAI } = require("@google/genai");

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
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable was not found. Please add it in Railway Variables.");
      }
      // ৫. নতুন ক্লায়েন্ট ইনিশিয়ালাইজেশন
      const ai = new GoogleGenAI({ apiKey: apiKey });

      // ৬. সর্বশেষ এবং দ্রুততম 'gemini-2.5-flash' মডেল দিয়ে কনটেন্ট জেনারেট করা
      const response = await ai.models.generateContent({
        model: "models/gemini-2.5-flash",
        contents: prompt,
      });

      const replyText = response.text;

      if (!replyText) {
        throw new Error("Gemini AI থেকে কোনো তথ্য পাওয়া যায়নি।");
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
