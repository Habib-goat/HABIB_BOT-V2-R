const axios = require("axios");
const fs = require("fs");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "poli",
		author: "MahMUD",
		version: "1.7",
		countDown: 10,
		role: 0,
		category: "Image gen",
		guide: "{pn} <prompt>"
	},

	onStart: async function ({ args, api, event }) {
		const { threadID, messageID } = event;

		if (args.length === 0) {
			return api.sendMessage("❌ | Please provide a prompt.", threadID, messageID);
		}

		const prompt = args.join(" ");
		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

		api.sendMessage("𝐖𝐚𝐢𝐭 𝐤𝐨𝐫𝐨 𝐣𝐚𝐧 😘", threadID, messageID);

		const imagePaths = [];
		try {
			const styles = ["ultra detailed", "4k resolution", "realistic lighting", "artstation", "digital painting"];

			for (let i = 0; i < 4; i++) {
				const enhancedPrompt = `${prompt}, ${styles[i % styles.length]}`;

				const response = await axios.post(`${await baseApiUrl()}/api/poli/generate`, {
					prompt: enhancedPrompt
				}, {
					responseType: "arraybuffer",
					headers: {
						"author": module.exports.config.author
					}
				});

				const filePath = path.join(cacheDir, `generated_${Date.now()}_${i}.png`);
				fs.writeFileSync(filePath, response.data);
				imagePaths.push(filePath);
			}

			const attachments = imagePaths.map(p => fs.createReadStream(p));
			api.sendMessage({
				body: "✅ | Here are images generated from your prompt:",
				attachment: attachments
			}, threadID, () => {
				imagePaths.forEach(p => {
					if (fs.existsSync(p)) fs.unlinkSync(p);
				});
			}, messageID);

		} catch (error) {
			console.error("Image generation error:", error);
			imagePaths.forEach(p => {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			});
			api.sendMessage("❌ | Couldn't generate images. Try again later.", threadID, messageID);
		}
	}
};
