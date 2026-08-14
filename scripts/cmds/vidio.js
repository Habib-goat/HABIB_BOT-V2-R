const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports = {
	config: {
		name: "vidio",
		aliases: ["video", "vid"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 10,
		role: 0,
		category: "media",
		shortDescription: "Download video from YouTube (by name or link)",
		longDescription: "Download YouTube video by providing a video name or link",
		guide: "{pn} <name or link>: Provide video name or link"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const input = args.join(" ");
		if (!input) {
			return api.sendMessage("× Baby, please provide a video name or link!", threadID, messageID);
		}

		let filePath;
		try {
			if (hasReaction) api.setMessageReaction("🐤", messageID, () => {}, true);

			const apiUrl = await baseApiUrl();
			const checkurl = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;
			let videoID;

			if (checkurl.test(input)) {
				videoID = input.match(checkurl)[1];
			} else {
				const searchRes = await axios.get(`${apiUrl}/api/ytb/search?q=${encodeURIComponent(input)}`);
				const results = searchRes.data.results;
				if (!results || results.length === 0) {
					if (hasReaction) api.setMessageReaction("🥹", messageID, () => {}, true);
					return api.sendMessage("× No results found.", threadID, messageID);
				}
				videoID = results[0].id;
			}

			const cacheDir = path.join(__dirname, "cache");
			if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
			filePath = path.join(cacheDir, `video_${Date.now()}.mp4`);

			const res = await axios.get(`${apiUrl}/api/ytb/get?id=${videoID}&type=video`);
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
			if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
			return api.sendMessage(`× API error: ${err.message || "Download failed!"}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	}
};
