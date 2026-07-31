const axios = require("axios");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "meme",
		aliases: ["memes", "মিম"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Get random funny meme images",
		category: "fun",
		guide: "{pn}: Use to get a random meme"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const apiUrlBase = await mahmud();
			const res = await axios.get(`${apiUrlBase}/api/meme`);
			const imageUrl = res.data?.imageUrl;

			if (!imageUrl) return api.sendMessage("× Could not fetch meme!", threadID, messageID);

			const stream = await axios({
				method: "GET",
				url: imageUrl,
				responseType: "stream",
				headers: { 'User-Agent': 'Mozilla/5.0' }
			});

			return api.sendMessage({
				body: "🐸 | 𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐫𝐚𝐧𝐝𝐨𝐦 𝐦𝐞𝐦𝐞 𝐛𝐚𝐛𝐲",
				attachment: stream.data
			}, threadID, () => {
				if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			}, messageID);

		} catch (err) {
			console.error("Meme Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
