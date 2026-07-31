const axios = require("axios");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "qwen",
		aliases: ["qwen7b"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Chat intelligently with Qwen AI",
		category: "ai",
		guide: "{pn} <question>: Type your question"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;
		const prompt = args.join(" ");
		if (!prompt) return api.sendMessage("× Baby, please ask something!", threadID, messageID);

		return module.exports.handleQwen({ api, event, prompt, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		return module.exports.handleQwen({ api, event, prompt, replyManager });
	},

	handleQwen: async function ({ api, event, prompt, replyManager }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const baseUrl = await baseApiUrl();
			const response = await axios.get(`${baseUrl}/api/ai`, {
				params: {
					prompt: prompt,
					ai: "qwen"
				}
			});

			const replyText = response.data.response || "No response received.";
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(replyText, threadID, (error, info) => {
				if (!error && info?.messageID && replyManager) {
					replyManager.set(info.messageID, {
						commandName: "qwen",
						author: event.senderID
					});
				}
			}, messageID);

		} catch (err) {
			console.error("Qwen Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			const errorMsg = err.response?.data?.error || err.message;
			return api.sendMessage(`× API error: ${errorMsg}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
