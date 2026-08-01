const axios = require("axios");
const fs = require("fs");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "fluxpro",
		version: "1.7",
		author: "MahMUD",
		countDown: 15,
		role: 0,
		description: "Generate high-quality AI images using Flux Pro model",
		category: "image gen",
		guide: "{pn} <prompt> --ratio <value>: Provide description and ratio"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const fullArgs = args.join(" ");
		if (!fullArgs) return api.sendMessage("× Baby, please provide a prompt to generate image!", threadID, messageID);

		const [prompt, ratio = "1:1"] = fullArgs.includes("--ratio")
			? fullArgs.split("--ratio").map(s => s.trim())
			: [fullArgs, "1:1"];

		const cacheDir = path.join(__dirname, "cache");
		const filePath = path.join(cacheDir, `fluxpro_${Date.now()}.png`);
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

		let waitMsg;
		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			waitMsg = await api.sendMessage("🔄 | Generating your image, please wait...", threadID, messageID);

			const baseUrl = await baseApiUrl();
			const url = `${baseUrl}/api/fluxpro?prompt=${encodeURIComponent(prompt)}&ratio=${ratio}`;

			const response = await axios.get(url, { responseType: "arraybuffer", timeout: 120000 });
			fs.writeFileSync(filePath, Buffer.from(response.data));

			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage({
				body: "𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐟𝐥𝐮𝐱 𝐩𝐫𝐨 𝐢𝐦𝐚𝐠𝐞 𝐛𝐚𝐛𝐲 😘",
				attachment: fs.createReadStream(filePath)
			}, threadID, () => {
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			}, messageID);

		} catch (err) {
			console.error("Flux Pro Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
