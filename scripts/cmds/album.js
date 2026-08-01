const axios = require("axios"), fs = require("fs"), path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "album",
		version: "2.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		category: "media",
		description: "Watch video albums from various categories",
		guide: "{pn} [page] | {pn} add [category] (reply to video) | {pn} list"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (args[0] === "add") {
				if (!args[1] || event.type !== "message_reply" || !event.messageReply.attachments.length) {
					return api.sendMessage("• Baby, please specify a category or reply to a video! 😘", threadID, messageID);
				}
				if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
				const imgurRes = await axios.get(`${(await baseApiUrl()).replace(/\/$/, "")}/imgur?url=${encodeURIComponent(event.messageReply.attachments[0].url)}`);
				const res = await axios.post(`${await baseApiUrl()}/album/mahmud/add`, { category: args[1].toLowerCase(), videoUrl: imgurRes.data.link });
				if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);
				return api.sendMessage(res.data.message, threadID, messageID);
			}

			if (args[0] === "list") {
				if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
				const res = await axios.get(`${await baseApiUrl()}/api/album2/mahmud/list`);
				if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);
				return api.sendMessage(res.data.message, threadID, messageID);
			}

			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			const configRes = await axios.get(`${await baseApiUrl()}/api/album2/mahmud/display`);
			const { displayNames, realCategories, captions } = configRes.data;
			const page = parseInt(args[0]) || 1, itemsPerPage = 10, totalPages = Math.ceil(displayNames.length / itemsPerPage);

			if (page < 1 || page > totalPages) {
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				return api.sendMessage(`× Invalid page! Max page: ${totalPages}`, threadID, messageID);
			}

			const startIndex = (page - 1) * itemsPerPage;
			const menu = `𝐀𝐯𝐚𝐢𝐥𝐚𝐛𝐥𝐞 𝐀𝐥𝐛𝐮𝐦 𝐕𝐢𝐝𝐞𝐨\n𐙚━━━━━━━━━━━━━━━━━━━━━ᡣ𐭩\n${displayNames.slice(startIndex, startIndex + itemsPerPage).map((name, i) => `${startIndex + i + 1}. ${name}`).join("\n")}\n𐙚━━━━━━━━━━━━━━━━━━━━━ᡣ𐭩\n♻ | 𝐏𝐚𝐠𝐞 [${page}/${totalPages}]😘\nℹ | 𝐓𝐲𝐩𝐞 !${this.config.name} ${page + 1} - 𝐭𝐨 𝐬𝐞𝐞 𝐧𝐞𝐱𝐭 𝐩𝐚𝐠𝐞.`;

			if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);
			return api.sendMessage(menu, threadID, (err, info) => {
				if (!err && info?.messageID && replyManager) {
					replyManager.set(info.messageID, { commandName: this.config.name, author: event.senderID, realCategories, captions });
				}
			}, messageID);
		} catch (err) {
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			const errorMsg = err.response?.data?.error || err.message || "Unknown error";
			return api.sendMessage(`× API error: ${errorMsg}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	},

	onReply: async function ({ api, event, Reply }) {
		if (event.senderID !== Reply.author) return;
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		if (Reply.messageID && typeof api.unsendMessage === "function") {
			try { api.unsendMessage(Reply.messageID); } catch (e) {}
		}

		const category = Reply.realCategories[parseInt(event.body) - 1];
		if (!category) return api.sendMessage("❌ Invalid selection.", threadID, messageID);

		let filePath;
		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			const response = await axios.get(`${await baseApiUrl()}/api/album2/mahmud/videos/${category}?userID=${event.senderID}`);

			if (!response.data.success) return api.sendMessage(response.data.message, threadID, messageID);

			const randomVideoUrl = response.data.videos[Math.floor(Math.random() * response.data.videos.length)];
			const cacheDir = path.join(__dirname, "cache");
			if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
			filePath = path.join(cacheDir, `album_${Date.now()}.mp4`);

			const res = await axios({ url: randomVideoUrl, method: "GET", responseType: "stream", headers: { 'User-Agent': 'Mozilla/5.0' } });
			const writer = fs.createWriteStream(filePath);
			res.data.pipe(writer);

			writer.on("finish", () => {
				if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);
				api.sendMessage({ body: Reply.captions[category] || Reply.captions["default"], attachment: fs.createReadStream(filePath) }, threadID, () => {
					if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
				}, messageID);
			});
			writer.on("error", (err) => {
				console.error("Album Write Error:", err);
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
				api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
			});
		} catch (err) {
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
			const errorMsg = err.response?.data?.error || err.message || "Unknown error";
			return api.sendMessage(`× API error: ${errorMsg}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
