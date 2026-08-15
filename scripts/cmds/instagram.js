const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const replyManager = require("../replies/replyManager");

// 👇 আপনার Instagram scraping API-এর base URL এখানে বসান
const API_BASE = "https://riyad-instagram-api.onrender.com";

// ক্যাটাগরি -> Instagram hashtag ম্যাপিং। Instagram-এ সত্যিকারের "category"
// সার্চ নেই, তাই hashtag-ই সবচেয়ে কাছাকাছি বাস্তবসম্মত বিকল্প। চাইলে এখানে
// আরও ক্যাটাগরি/hashtag যোগ করা যাবে।
const CATEGORIES = [
	{ key: "sad", label: "😢 Sad", tag: "sadstatusvideo" },
	{ key: "funny", label: "😂 Funny", tag: "funnyvideos" },
	{ key: "caption", label: "✍️ Caption", tag: "captionvideos" },
	{ key: "love", label: "❤️ Love", tag: "lovestatusvideo" },
	{ key: "motivational", label: "🔥 Motivational", tag: "motivationvideo" },
	{ key: "attitude", label: "😎 Attitude", tag: "attitudestatusvideo" }
];

function findCategory(input) {
	if (!input) return null;
	const q = input.trim().toLowerCase();
	return CATEGORIES.find((c) => c.key === q || c.label.toLowerCase().includes(q)) || null;
}

async function fetchRandomVideo(tag) {
	const res = await axios.get(`${API_BASE}/api/instagram/hashtag`, {
		params: { tag, limit: 20 },
		timeout: 30000
	});

	const posts = Array.isArray(res.data) ? res.data : [];
	const videos = posts.filter((p) => p.isVideo && p.videoUrl);

	if (videos.length === 0) return null;
	return videos[Math.floor(Math.random() * videos.length)];
}

async function downloadAndSend(api, threadID, messageID, video, categoryLabel) {
	const hasReaction = typeof api.setMessageReaction === "function";
	const cacheDir = path.join(__dirname, "cache");
	await fs.ensureDir(cacheDir);
	const filePath = path.join(cacheDir, `insta_${Date.now()}.mp4`);

	try {
		if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

		// .m3u8 প্লেলিস্ট সরাসরি একটা ফাইল হিসেবে ডাউনলোড/পাঠানো যায় না —
		// শুধু direct .mp4 লিংক হ্যান্ডেল করছি।
		if (!/\.mp4(\?|$)/i.test(video.videoUrl)) {
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(
				"❌ | এই ভিডিওটার সরাসরি mp4 লিংক পাওয়া যায়নি (streaming-only ফরম্যাট)। আবার ট্রাই করুন, অন্য ভিডিও আসবে।",
				threadID,
				messageID
			);
		}

		const response = await axios.get(video.videoUrl, {
			responseType: "arraybuffer",
			timeout: 45000,
			headers: { "User-Agent": "Mozilla/5.0" }
		});

		await fs.writeFile(filePath, Buffer.from(response.data));

		if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

		const caption = video.caption ? video.caption.slice(0, 150) : "";

		await api.sendMessage(
			{
				body: `🎬 | ${categoryLabel} Video${caption ? `\n${caption}` : ""}`,
				attachment: fs.createReadStream(filePath)
			},
			threadID,
			(err) => {
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			},
			messageID
		);
	} catch (err) {
		console.error("[instagram] download/send error:", err.message);
		if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		return api.sendMessage(`❌ | ভিডিও পাঠাতে সমস্যা হয়েছে: ${err.message}`, threadID, messageID);
	}
}

module.exports = {
	config: {
		name: "instagram",
		aliases: ["insta"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 8,
		role: 0,
		category: "media",
		shortDescription: "Instagram category video (sad/funny/caption etc)",
		longDescription: "Random Instagram video by category. Use {pn} to see the menu, or {pn} <category> directly (e.g. insta sad).",
		guide: "{pn} — menu দেখাবে, রিপ্লাই এ নাম্বার দিলে সেই ক্যাটাগরির ভিডিও আসবে।\n{pn} <category> — সরাসরি সেই ক্যাটাগরির ভিডিও আনবে (যেমন: insta sad)"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;
		const query = args.join(" ").trim();

		// ── সরাসরি: "insta sad" / "insta funny" ─────────────────────────
		if (query) {
			const category = findCategory(query);
			if (!category) {
				const list = CATEGORIES.map((c) => `• ${c.key}`).join("\n");
				return api.sendMessage(
					`❌ | এই ক্যাটাগরি পাওয়া যায়নি।\n\nAvailable categories:\n${list}`,
					threadID,
					messageID
				);
			}

			try {
				const video = await fetchRandomVideo(category.tag);
				if (!video) {
					return api.sendMessage(`❌ | "${category.label}" ক্যাটাগরিতে এখন কোনো ভিডিও পাওয়া যায়নি। আবার চেষ্টা করুন।`, threadID, messageID);
				}
				return downloadAndSend(api, threadID, messageID, video, category.label);
			} catch (err) {
				console.error("[instagram] fetch error:", err.message);
				return api.sendMessage(`❌ | API error: ${err.message}`, threadID, messageID);
			}
		}

		// ── মেনু দেখানো ──────────────────────────────────────────────────
		let body = "📂 | Instagram Video Categories\n\n";
		CATEGORIES.forEach((c, i) => {
			body += `${i + 1}. ${c.label}\n`;
		});
		body += `\n👉 Reply with a number (1-${CATEGORIES.length}) to get a random video from that category.`;

		return api.sendMessage(body, threadID, (err, info) => {
			if (!err && info?.messageID) {
				replyManager.set(info.messageID, {
					commandName: this.config.name,
					author: senderID
				});
			}
		}, messageID);
	},

	onReply: async function ({ api, event, Reply }) {
		const { threadID, messageID, senderID, body } = event;
		if (senderID !== Reply.author) return;

		const choice = parseInt(body, 10);
		if (isNaN(choice) || choice < 1 || choice > CATEGORIES.length) {
			return api.sendMessage(`❌ | ১ থেকে ${CATEGORIES.length} এর মধ্যে একটা নাম্বার দিন।`, threadID, messageID);
		}

		const category = CATEGORIES[choice - 1];

		try {
			const video = await fetchRandomVideo(category.tag);
			if (!video) {
				return api.sendMessage(`❌ | "${category.label}" ক্যাটাগরিতে এখন কোনো ভিডিও পাওয়া যায়নি।`, threadID, messageID);
			}
			return downloadAndSend(api, threadID, messageID, video, category.label);
		} catch (err) {
			console.error("[instagram] reply fetch error:", err.message);
			return api.sendMessage(`❌ | API error: ${err.message}`, threadID, messageID);
		}
	}
};
