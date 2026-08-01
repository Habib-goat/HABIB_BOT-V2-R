const axios = require("axios");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "hadis",
		aliases: ["hadith", "হাদিস"],
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Get a random Bangla Hadis with its source",
		category: "Islamic",
		guide: "{pn}: Use to get a random Hadis"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⌛", messageID, () => {}, true);

			const baseUrl = await mahmud();
			const res = await axios.get(`${baseUrl}/api/hadis`);

			if (!res.data || !res.data.text) throw new Error("Hadis content not found.");

			const { text, source } = res.data;
			const msg = `${text}\n`
				+ `• ${source || "Unknown"} 🖤`;

			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			return api.sendMessage(msg, threadID, messageID);

		} catch (err) {
			console.error("Hadis Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
