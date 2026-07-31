const axios = require("axios");
const fs = require("fs");
const path = require("path");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "removebg",
		aliases: ["rmbg", "rbg"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		category: "tools",
		guide: "{pn} [Reply to an image]"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID, type, messageReply } = event;

		const hasReaction = typeof api.setMessageReaction === "function";

		if (type !== "message_reply" || !messageReply?.attachments || messageReply.attachments[0].type !== "photo") {
			return api.sendMessage("• Baby, please reply to an image to remove background.", threadID, messageID);
		}

		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
		const outputPath = path.join(cacheDir, `rmbg_${Date.now()}.png`);

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const imageUrl = messageReply.attachments[0].url;
			const apiUrlBase = await mahmud();

			const response = await axios.post(
				`${apiUrlBase}/api/rmbg`,
				{ imageUrl },
				{ responseType: "stream" }
			);

			const writer = fs.createWriteStream(outputPath);
			response.data.pipe(writer);

			writer.on("finish", () => {
				api.sendMessage({
					body: "✅ Background Removed Successfully!",
					attachment: fs.createReadStream(outputPath)
				}, threadID, (err) => {
					if (!err && hasReaction) {
						api.setMessageReaction("🪽", messageID, () => {}, true);
					}
					if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				}, messageID);
			});

			writer.on("error", (err) => {
				console.error("Removebg Write Error:", err);
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
				api.sendMessage(`❌ An error occurred: contact MahMUD ${err.message}`, threadID, messageID);
			});

		} catch (error) {
			console.error("Removebg Error:", error);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
			api.sendMessage(`❌ An error occurred: contact MahMUD ${error.message || "API Error"}`, threadID, messageID);
		}
	}
};
