const axios = require("axios");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "ocr",
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		category: "tools",
		description: "Extract text from images (OCR)",
		guide: "{pn}: Reply to an image to get text."
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		if (event.type !== "message_reply" || !event.messageReply.attachments.length || event.messageReply.attachments[0].type !== "photo") {
			return api.sendMessage("× Baby, please reply to an image!", threadID, messageID);
		}

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const apiBase = await mahmud();
			const imageUrl = event.messageReply.attachments[0].url;
			const ocrPrompt = "Extract all text from this image accurately.";

			const response = await axios.post(`${apiBase}/api/gemini`, {
				prompt: ocrPrompt,
				imageUrl: imageUrl
			}, {
				headers: {
					"Content-Type": "application/json",
					"author": "MahMUD"
				}
			});

			const resultText = response.data.response || "× No text found in the image.";

			if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);
			return api.sendMessage(resultText, threadID, messageID);

		} catch (err) {
			console.error("OCR Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.response?.data?.error || err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
