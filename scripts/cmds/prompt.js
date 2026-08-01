const axios = require("axios");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "prompt",
		aliases: ["p"],
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Generate a detailed prompt or description from any image",
		category: "ai",
		guide: "{pn}: Reply to an image\n   {pn} <custom prompt>: Ask specific about the image"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		if (!(event.type === "message_reply" && event.messageReply.attachments[0]?.type === "photo")) {
			return api.sendMessage("× Baby, please reply to an image to use this command! 🖼️", threadID, messageID);
		}

		const prompt = args.join(" ") || "Describe this image in detail";
		const imageUrl = event.messageReply.attachments[0].url;

		try {
			const baseUrl = await mahmud();
			const apiUrl = `${baseUrl}/api/prompt`;

			const response = await axios.post(apiUrl, {
				imageUrl,
				prompt
			}, {
				headers: {
					"Content-Type": "application/json",
					"author": "MahMUD"
				}
			});

			const replyText = response.data.response || response.data.error || "No response";

			api.sendMessage(replyText, threadID, messageID);
			if (hasReaction) return api.setMessageReaction("🪽", messageID, () => {}, true);

		} catch (err) {
			console.error("Prompt AI Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
