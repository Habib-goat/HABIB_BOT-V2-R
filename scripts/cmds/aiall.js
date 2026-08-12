const axios = require("axios");

// Get your key from https://api.bluesminds.com/console (Token Manager)
const BLUESMINDS_API_KEY = "sk-KDSePwoZD2KYdl8VV3rwBP57PHNpX8e7ctWHIrcZxhjYSCXM";
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";

module.exports = {
	config: {
		name: "aiall",
		aliases: ["gpt", "claude", "gemini", " aiall"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		category: "ai",
		guide: "{pn} <question>: Ask anything to AI\n   You can continue chatting by replying to the bot's answer"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;
		const prompt = args.join(" ");

		if (!prompt) {
			return api.sendMessage("× Baby, please ask something!\nExample: ai What is the capital of France?", threadID, messageID);
		}

		return this.handleAI({ api, event, prompt, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		return this.handleAI({ api, event, prompt, replyManager });
	},

	handleAI: async function ({ api, event, prompt, replyManager }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const response = await axios.post(
				`${BLUESMINDS_BASE}/chat/completions`,
				{
					model: "gpt-4o",
					messages: [{ role: "user", content: prompt }]
				},
				{
					headers: {
						"Authorization": `Bearer ${BLUESMINDS_API_KEY}`,
						"Content-Type": "application/json"
					},
					timeout: 60000
				}
			);

			const replyText = response.data?.choices?.[0]?.message?.content || "No response received.";
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(replyText, threadID, (error, info) => {
				if (!error && info?.messageID && replyManager) {
					replyManager.set(info.messageID, {
						commandName: "ai",
						author: event.senderID
					});
				}
			}, messageID);

		} catch (err) {
			console.error("AI Command Error:", err.response?.data || err.message);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			const errorMsg = err.response?.data?.error?.message || err.message;
			return api.sendMessage(`× API error: ${errorMsg}`, threadID, messageID);
		}
	}
};
