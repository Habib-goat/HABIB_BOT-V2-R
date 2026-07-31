const axios = require("axios");
const fs = require("fs");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "dalle3",
		version: "1.7",
		author: "MahMUD",
		countDown: 15,
		role: 0,
		description: "Generate AI images using DALL-E 3 model",
		category: "image gen",
		guide: "{pn} <prompt>: Provide a description to generate image"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const prompt = args.join(" ");
		if (!prompt) return api.sendMessage("× Baby, please provide a prompt to generate image", threadID, messageID);

		const cacheDir = path.join(__dirname, "cache");
		const filePath = path.join(cacheDir, `dalle3_${Date.now()}.png`);
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

		let waitMsg;
		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			waitMsg = await api.sendMessage("🔄 | DALL-E 3 Image Generating, please wait...", threadID, messageID);

			const baseUrl = await baseApiUrl();
			const response = await axios.post(`${baseUrl}/api/dalle3`,
				{ prompt },
				{ responseType: "arraybuffer" }
			);

			fs.writeFileSync(filePath, Buffer.from(response.data));

			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage({
				body: "𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐃𝐀𝐋𝐋-𝐄 𝟑 𝐢𝐦𝐚𝐠𝐞 𝐛𝐚𝐛𝐲 😘",
				attachment: fs.createReadStream(filePath)
			}, threadID, () => {
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			}, messageID);

		} catch (err) {
			console.error("Dalle3 Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
