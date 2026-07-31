const axios = require("axios");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "numinfo",
		aliases: ["numberinfo", "numlookup"],
		version: "1.7",
		author: "MahMUD",
		role: 0,
		category: "info",
		countDown: 10,
		guide: "{pn} [number]"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		if (!args[0]) {
			return api.sendMessage(`• Baby, provide a number. Example: ${this.config.name} 01836298139`, threadID, messageID);
		}

		let number = args.join("").replace(/\D/g, "");
		if (number.startsWith("0")) {
			number = "88" + number;
		} else if (!number.startsWith("88")) {
			return api.sendMessage("❌ Invalid number format!", threadID, messageID);
		}

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const apiUrl = await baseApiUrl();
			const response = await axios.get(`${apiUrl}/api/numinfo?number=${number}`);
			const data = response.data;

			if (!data.success) throw new Error("API failed to fetch data");

			const msg = `📱 Number Info:\n\n• Name: ${data.name}\n• Number: ${number}\n• FB ID: ${data.facebook_id}`;

			api.sendMessage(msg, threadID, () => {
				if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			}, messageID);

		} catch (err) {
			console.error("Numinfo Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			api.sendMessage(`❌ An error occurred: contact MahMUD ${err.message || "API Error"}\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
