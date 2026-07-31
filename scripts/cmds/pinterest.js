const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "pin",
		aliases: ["pinterest", "pic"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Search and download images from Pinterest",
		category: "image gen",
		guide: "{pn} <query> - <amount>: (Ex: {pn} goku - 10)"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		const queryAndLength = args.join(" ").split("-");
		const keySearch = queryAndLength[0]?.trim();
		const count = queryAndLength[1]?.trim();
		const numberSearch = count ? Math.min(parseInt(count), 20) : 6;

		if (!keySearch) {
			return api.sendMessage("× Baby, please enter a search query and amount! 🔍\nExample: pin goku - 10", threadID, messageID);
		}

		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const response = await axios.get(`${await baseApiUrl()}/api/pin/mahmud?query=${encodeURIComponent(keySearch)}&limit=${numberSearch}`);

			const data = response.data.images;
			if (!data || data.length === 0) {
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				return api.sendMessage("× Sorry, no images found for your query.", threadID, messageID);
			}

			const attachments = [];
			const imgPaths = [];
			for (let i = 0; i < data.length; i++) {
				const imgRes = await axios.get(data[i], { responseType: "arraybuffer" });
				const imgPath = path.join(cacheDir, `pin_${Date.now()}_${i}.jpg`);
				await fs.outputFile(imgPath, imgRes.data);
				imgPaths.push(imgPath);
				attachments.push(fs.createReadStream(imgPath));
			}

			await api.sendMessage({
				body: `✅ | Here are your ${attachments.length} images for "${keySearch}":`,
				attachment: attachments
			}, threadID, messageID, () => {
				if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
				imgPaths.forEach(p => {
					if (fs.existsSync(p)) fs.unlinkSync(p);
				});
			});

		} catch (err) {
			console.error("Pinterest Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
