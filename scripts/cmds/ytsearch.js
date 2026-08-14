const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const replyManager = require("../replies/replyManager");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "ytsearch",
		aliases: ["ytfind", "searchvideo"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 10,
		role: 0,
		category: "media",
		shortDescription: "Search YouTube videos and download your choice",
		longDescription: "Search videos from YouTube and download by replying with a number",
		guide: "{pn} <name>: Enter name to search videos"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const keyWord = args.join(" ");
		if (!keyWord) {
			return api.sendMessage("× Baby, please provide a video name! 🔍", threadID, messageID);
		}

		try {
			if (hasReaction) api.setMessageReaction("🐤", messageID, () => {}, true);

			const res = await axios.get(`${await baseApiUrl()}/api/ytb/search?q=${encodeURIComponent(keyWord)}`);
			const result = res.data.results ? res.data.results.slice(0, 6) : [];

			if (!result || result.length === 0) {
				if (hasReaction) api.setMessageReaction("🥹", messageID, () => {}, true);
				return api.sendMessage("× No results found.", threadID, messageID);
			}

			let listMsg = "";
			const attachments = [];
			const cacheDir = path.join(__dirname, "cache");
			if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

			for (let i = 0; i < result.length; i++) {
				const info = result[i];
				const channelName = typeof info.channel === "object" ? info.channel.name : info.channel;
				listMsg += `${i + 1}. ${info.title}\nTime: ${info.time} | Channel: ${channelName || "N/A"}\n\n`;

				const thumbPath = path.join(cacheDir, `thumb_${senderID}_${Date.now()}_${i}.jpg`);
				const thumbRes = await axios.get(info.thumbnail, { responseType: "arraybuffer" });
				fs.writeFileSync(thumbPath, Buffer.from(thumbRes.data));
				attachments.push(fs.createReadStream(thumbPath));
			}

			if (hasReaction) api.setMessageReaction("🪽", messageID, () => {}, true);

			return api.sendMessage({
				body: `𝐒𝐞𝐥𝐞𝐜𝐭 𝐚 𝐯𝐢𝐝𝐞𝐨:\n\n${listMsg}• Reply with the number to download`,
				attachment: attachments
			}, threadID, (err, info) => {
				attachments.forEach(stream => { if (fs.existsSync(stream.path)) fs.unlinkSync(stream.path); });

				if (!err && info?.messageID) {
					replyManager.set(info.messageID, {
						commandName: this.config.name,
						author: senderID,
						result,
						menuMessageID: info.messageID
					});
				}
			}, messageID);

		} catch (err) {
			console.error("Search Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	},

	onReply: async function ({ event, api, Reply }) {
		const { threadID, messageID, senderID, body } = event;
		const { result, author, menuMessageID } = Reply;
		if (senderID !== author) return;

		const choice = parseInt(body);
		if (isNaN(choice) || choice <= 0 || choice > result.length) return;

		const hasReaction = typeof api.setMessageReaction === "function";
		const targetMessageID = menuMessageID || Reply.messageID;
		if (targetMessageID && typeof api.unsendMessage === "function") {
			try { api.unsendMessage(targetMessageID); } catch (e) {}
		}
		if (hasReaction) api.setMessageReaction("⌛", messageID, () => {}, true);

		const videoID = result[choice - 1].id;
		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
		const filePath = path.join(cacheDir, `video_${Date.now()}.mp4`);

		try {
			const res = await axios.get(`${await baseApiUrl()}/api/ytb/get?id=${videoID}&type=video`);
			const { title, downloadLink } = res.data.data;

			const response = await axios({ url: downloadLink, method: "GET", responseType: "stream" });
			const writer = fs.createWriteStream(filePath);
			response.data.pipe(writer);

			writer.on("finish", () => {
				api.sendMessage({
					body: `✅ 𝙃𝙚𝙧𝙚'𝙨 𝙮𝙤𝙪𝙧 𝙫𝙞𝙙𝙚𝙤 𝙗𝙖𝙗𝙮\n\n• 𝐓𝐢𝐭𝐥𝐞: ${title}`,
					attachment: fs.createReadStream(filePath)
				}, threadID, () => {
					if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
					if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
				}, messageID);
			});

			writer.on("error", (err) => {
				throw err;
			});

		} catch (err) {
			console.error("error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return api.sendMessage(`× API error: ${err.message || "Download failed!"}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
