const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "edit",
		aliases: ["imgedit"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Edit your image using AI prompt",
		category: "image",
		guide: "{pn} <prompt>: Reply to an image with edit instructions\n   Example: {pn} add sunglasses to face"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const prompt = args.join(" ");
		const repliedImage = event.messageReply?.attachments?.[0];

		if (!prompt || !repliedImage || repliedImage.type !== "photo") {
			return api.sendMessage("× Baby, please reply to a photo with your prompt to edit it! 🪄", threadID, messageID);
		}

		const cacheDir = path.join(__dirname, "cache");
		const imgPath = path.join(cacheDir, `${Date.now()}_edit.jpg`);
		await fs.ensureDir(cacheDir);

		const waitMsg = await api.sendMessage("🔄 | Editing your image, please wait...", threadID, messageID);

		try {
			const res = await axios.post(
				`${await baseApiUrl()}/api/edit`,
				{ prompt, imageUrl: repliedImage.url },
				{ responseType: "arraybuffer" }
			);

			await fs.writeFile(imgPath, Buffer.from(res.data, "binary"));

			await api.sendMessage({
				body: `✅ Here's your Edited image\nPrompt: ${prompt}`,
				attachment: fs.createReadStream(imgPath)
			}, threadID, messageID);

		} catch (err) {
			console.error("Edit Command Error:", err);
			return api.sendMessage(`× Failed to edit: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		} finally {
			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			setTimeout(() => {
				if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
			}, 10000);
		}
	}
};
