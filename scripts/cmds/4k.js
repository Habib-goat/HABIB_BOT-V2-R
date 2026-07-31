const axios = require("axios");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "4k",
		aliases: ["hd", "upscale"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Enhance or restore image quality to 4K using AI",
		category: "tools",
		guide: "{pn} [url]: Upscale image via URL\n   Or reply to an image with {pn}"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		let imgUrl;
		if (event.messageReply?.attachments?.[0]?.type === "photo") {
			imgUrl = event.messageReply.attachments[0].url;
		} else if (args[0]) {
			imgUrl = args.join(" ");
		}

		if (!imgUrl) {
			return api.sendMessage("• Baby, please reply to an image or provide a link! 😘", threadID, messageID);
		}

		if (typeof api.setMessageReaction === "function") {
			api.setMessageReaction("😘", messageID, () => {}, true);
		}

		try {
			const response = await axios.get(`${await baseApiUrl()}/api/hd/mahmud?imgUrl=${encodeURIComponent(imgUrl)}`, {
				method: "GET",
				responseType: "stream",
				headers: { 'User-Agent': 'Mozilla/5.0' }
			});

			if (typeof api.setMessageReaction === "function") {
				api.setMessageReaction("🪽", messageID, () => {}, true);
			}

			return api.sendMessage({
				body: "✅ | 𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝟒𝐤 𝐢𝐦𝐚𝐠𝐞 𝐛𝐚𝐛𝐲",
				attachment: response.data
			}, threadID, messageID);

		} catch (err) {
			console.error("Error in 4k command:", err);
			if (typeof api.setMessageReaction === "function") {
				api.setMessageReaction("❌", messageID, () => {}, true);
			}
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
