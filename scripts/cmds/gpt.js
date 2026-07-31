const axios = require("axios");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "gpt",
		aliases: ["gpt4"],
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Chat with GPT-4 AI",
		category: "ai",
		guide: "{pn} <question>: Type your question"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;
		const prompt = args.join(" ");
		if (!prompt) return api.sendMessage("× Baby, please ask something!", threadID, messageID);

		return this.handleGPT({ api, event, prompt, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		return this.handleGPT({ api, event, prompt, replyManager });
	},

	handleGPT: async function ({ api, event, prompt, replyManager }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const baseUrl = await baseApiUrl();
			const response = await axios.get(`${baseUrl}/api/ai`, {
				params: {
					prompt: prompt,
					ai: "gpt"
				}
			});

			const replyText = response.data.response || "No response received.";
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(replyText, threadID, (error, info) => {
				if (!error && info?.messageID && replyManager) {
					replyManager.set(info.messageID, {
						commandName: "gpt",
						author: event.senderID
					});
				}
			}, messageID);

		} catch (err) {
			console.error("GPT Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			const errorMsg = err.response?.data?.error || err.message;
			return api.sendMessage(`× API error: ${errorMsg}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
