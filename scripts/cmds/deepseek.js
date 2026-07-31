const axios = require("axios");

const getBaseApi = async () => {
	const res = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return res.data.mahmud;
};

module.exports = {
	config: {
		name: "deepseek",
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Get answers from DeepSeek AI",
		category: "ai",
		guide: "{pn} <prompt>: Ask anything to AI\n   You can continue chat by replying"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;
		const prompt = args.join(" ");
		if (!prompt) return api.sendMessage(`⚠️ Baby, please provide a prompt! Example: deepseek Who are you?`, threadID, messageID);

		return await handleDeepSeek(api, event, prompt, this.config.name, replyManager);
	},

	onReply: async function ({ api, event, Reply, args, replyManager }) {
		if (Reply.author !== event.senderID) return;

		const prompt = args.join(" ");
		if (!prompt) return;

		return await handleDeepSeek(api, event, prompt, "deepseek", replyManager);
	}
};

async function handleDeepSeek(api, event, prompt, commandName, replyManager) {
	const { threadID, messageID } = event;
	try {
		const baseApi = await getBaseApi();
		const apiUrl = `${baseApi}/api/deepseek?prompt=${encodeURIComponent(prompt)}`;
		const response = await axios.get(apiUrl);
		const replyText = response.data.response || "× No response from AI.";

		api.sendMessage(replyText, threadID, (error, info) => {
			if (!error && info?.messageID && replyManager) {
				replyManager.set(info.messageID, {
					commandName: commandName,
					author: event.senderID
				});
			}
		}, messageID);

	} catch (err) {
		console.error("DeepSeek Error:", err);
		api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
	}
}
