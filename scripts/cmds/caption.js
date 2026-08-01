const axios = require("axios");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "caption",
		aliases: ["cp", "ক্যাপশন"],
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Get captions from various categories or add new ones",
		category: "love",
		guide: '{pn} <category> <lang>: Get caption (Default: bn)'
			+ '\n   {pn} list: See all categories'
			+ '\n   {pn} add <cat> <lang> <text>: Add new caption'
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		try {
			const baseUrl = await baseApiUrl();

			if (args[0] === "list") {
				const res = await axios.get(`${baseUrl}/api/caption/list`);
				const categories = res.data.categories.map(cat => `• ${cat}`).join("\n");
				return api.sendMessage(">🎀 Available categories:\n\n" + categories, threadID, messageID);
			}

			if (args[0] === "add") {
				if (args.length < 4) return api.sendMessage("⚠ Usage: caption add <category> <bn/en> <text>", threadID, messageID);
				const category = args[1];
				const language = args[2];
				const captionText = args.slice(3).join(" ");

				const res = await axios.post(`${baseUrl}/api/caption/add`, {
					category,
					language,
					caption: captionText
				});
				return api.sendMessage(res.data.message, threadID, messageID);
			}

			if (!args[0]) return api.sendMessage("× Baby, please specify a category! Example: caption love", threadID, messageID);

			const category = args[0];
			const language = args[1] || "bn";

			const res = await axios.get(`${baseUrl}/api/caption`, {
				params: { category, language }
			});

			return api.sendMessage(`✅| Here's your ${category} caption:\n\n${res.data.caption}`, threadID, messageID);

		} catch (err) {
			console.error("Caption Error:", err);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
