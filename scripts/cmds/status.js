const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// প্রতিটা ক্যাটাগরির জন্য AI-কে দেওয়া প্রম্পট
const CATEGORY_PROMPTS = {
	islamic: "তুমি একজন বাংলা উক্তি লেখক। আমাকে ইসলাম ধর্ম সম্পর্কিত (কুরআন/হাদিসের ভাবার্থ, ধৈর্য, দোয়া, তাকওয়া বিষয়ক) একটি অনুপ্রেরণামূলক বাংলা উক্তি দাও। শুধু উক্তিটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
	valobasha: "তুমি একজন বাংলা উক্তি লেখক। আমাকে ভালোবাসা নিয়ে একটি হৃদয়স্পর্শী রোমান্টিক বাংলা উক্তি দাও। শুধু উক্তিটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
	kosto: "তুমি একজন বাংলা উক্তি লেখক। আমাকে কষ্ট/দুঃখ/বিরহ নিয়ে একটি আবেগঘন বাংলা উক্তি দাও। শুধু উক্তিটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
	hasi: "তুমি একজন বাংলা উক্তি লেখক। আমাকে হাসি/আনন্দ/জীবনকে উপভোগ করা নিয়ে একটি মজার বা ইতিবাচক বাংলা উক্তি দাও। শুধু উক্তিটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।",
	attitude: "তুমি একজন বাংলা উক্তি লেখক। আমাকে attitude/আত্মবিশ্বাস/নিজের উপর বিশ্বাস নিয়ে একটি শক্তিশালী বাংলা উক্তি দাও। শুধু উক্তিটি লিখবে, ২-৩ লাইনের মধ্যে, কোনো ভূমিকা, ব্যাখ্যা, বা quotation mark ছাড়া।"
};

const ALIASES_MAP = {
	islamic: "islamic", islam: "islamic", deen: "islamic",
	valobasha: "valobasha", love: "valobasha", bhalobasha: "valobasha",
	kosto: "kosto", sad: "kosto", dukkho: "kosto",
	hasi: "hasi", funny: "hasi", mojar: "hasi",
	attitude: "attitude", att: "attitude"
};

const EMOJI_MAP = {
	islamic: "🕌", valobasha: "❤️", kosto: "😔", hasi: "😄", attitude: "🔥"
};

module.exports = {
	config: {
		name: "status",
		aliases: ["ukti", "status"],
		version: "2.0.0",
		author: "Riyad",
		countDown: 8,
		role: 0,
		category: "ai",
		description: "Gemini AI দিয়ে বাংলা উক্তি জেনারেট করে",
		guide: "{pn} <islamic|valobasha|kosto|hasi|attitude>\nউদাহরণ: {pn} valobasha"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		if (!process.env.GEMINI_API_KEY) {
			return api.sendMessage("❌ | GEMINI_API_KEY সেট করা নেই (.env ফাইলে যোগ করুন)।", threadID, messageID);
		}

		const input = (args[0] || "").toLowerCase();
		const category = ALIASES_MAP[input];

		if (!category) {
			return api.sendMessage(
				"❌ | সঠিক ক্যাটাগরি দিন:\nislamic, valobasha, kosto, hasi, attitude\n\nউদাহরণ: quote valobasha",
				threadID,
				messageID
			);
		}

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const result = await ai.models.generateContent({
				model: "gemini-2.5-flash",
				contents: CATEGORY_PROMPTS[category]
			});

			let quote = (result.text || "").trim();
			// AI মাঝে মাঝে quotation mark বা markdown দিয়ে ঘিরে দেয়, সেটা সরিয়ে ফেলা হচ্ছে
			quote = quote.replace(/^["'"'*]+|["'"'*]+$/g, "").trim();

			if (!quote) {
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				return api.sendMessage("❌ | কোনো উক্তি পাওয়া যায়নি, আবার চেষ্টা করুন।", threadID, messageID);
			}

			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			return api.sendMessage(`${EMOJI_MAP[category]} | ${quote}`, threadID, messageID);
		} catch (err) {
			console.error("quote error:", err?.response?.data || err.message);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`❌ | Gemini API error: ${err.message}`, threadID, messageID);
		}
	}
};
