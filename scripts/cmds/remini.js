const axios = require("axios");

const mahmud = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "remini",
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "Enhance or restore image quality using Remini AI",
		category: "tools",
		guide: "{pn} [url]: Enhance image via URL\n   Or reply to an image with {pn}"
	},

	onStart: async function ({ api, args, event }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		let imgUrl;
		if (event.messageReply?.attachments?.[0]?.type === "photo") {
			imgUrl = event.messageReply.attachments[0].url;
		} else if (args[0]) {
			imgUrl = args.join(" ");
		}

		if (!imgUrl) {
			return api.sendMessage("• Baby, please reply to an image or provide a link! 😘", threadID, messageID);
		}

		const waitMsg = await api.sendMessage("𝐑𝐞𝐦𝐢𝐧𝐢 𝐢𝐦𝐚𝐠𝐞𝐬 𝐥𝐨𝐚𝐝𝐢𝐧𝐠...𝐰𝐚𝐢𝐭 𝐛𝐚𝐛𝐲 😘", threadID, messageID);
		if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

		try {
			const baseUrl = await mahmud();
			const apiUrl = `${baseUrl}/api/hd/mahmud?imgUrl=${encodeURIComponent(imgUrl)}`;

			const res = await axios.get(apiUrl, { responseType: "stream" });

			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage({
				body: "✅ | 𝐇𝐞𝐫𝐞'𝐬 𝐲𝐨𝐮𝐫 𝐑𝐞𝐦𝐢𝐧𝐢 𝐢𝐦𝐚𝐠𝐞 𝐛𝐚𝐛𝐲",
				attachment: res.data
			}, threadID, messageID);

		} catch (err) {
			console.error("Error in remini command:", err);
			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
