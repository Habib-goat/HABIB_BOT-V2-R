const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const replyManager = require("../replies/replyManager");

// 👇 আপনার Instagram scraping API-এর base URL এখানে বসান
const API_BASE = "https://riyad-instagram-api.onrender.com";

// ক্যাটাগরি লিস্ট — প্রতিটার আসল hashtag/profile সার্ভারের hashtags.js /
// profiles.js এ রাখা আছে (server.js প্রথমে profiles.js চেক করে, category-তে
// profile configured থাকলে সেটাই ব্যবহার করে — না থাকলে hashtags.js এ fall
// back করে)। এখানে শুধু key/label রাখা হয়েছে, bot এর মেনু দেখানোর জন্য।
const CATEGORIES = [
	{ key: "sad", label: "😢 Sad" },
	{ key: "funny", label: "😂 Funny" },
	{ key: "caption", label: "✍️ Caption" },
	{ key: "love", label: "❤️ Love" },
	{ key: "lyrics", label: "🎵 Lyrics" },
	{ key: "90s", label: "🎶 90s Song" },
	{ key: "motivational", label: "🔥 Motivational" },
	{ key: "attitude", label: "😎 Attitude" }
];

// একই ভিডিও পরপর কয়েকবার এড়াতে, প্রতিটা ক্যাটাগরির জন্য সাম্প্রতিক পাঠানো
// ভিডিও ID মনে রাখা হয় (in-memory, bot restart হলে রিসেট হয়ে যাবে —
// এটাই যথেষ্ট, permanent storage দরকার নেই)।
const RECENT_HISTORY_SIZE = 8;
const recentlySent = new Map(); // category -> Set<videoId>

function rememberSent(category, id) {
	if (!id) return;
	if (!recentlySent.has(category)) recentlySent.set(category, new Set());
	const set = recentlySent.get(category);
	set.add(id);
	if (set.size > RECENT_HISTORY_SIZE) {
		const oldest = set.values().next().value;
		set.delete(oldest);
	}
}

function wasRecentlySent(category, id) {
	return recentlySent.get(category)?.has(id) || false;
}

function findCategory(input) {
	if (!input) return null;
	const q = input.trim().toLowerCase();
	return CATEGORIES.find((c) => c.key === q || c.label.toLowerCase().includes(q)) || null;
}

async function fetchRandomVideo(categoryKey) {
	let videos = [];
	try {
		// সার্ভার নিজে থেকেই এই category-র জন্য configured সব profile/hashtag
		// একে একে (random order এ) try করে — প্রতিবার একই profile ব্যবহার হয়
		// না, প্রথম যেটায় ভিডিও পাওয়া যায় সেটার ফলাফল ফেরত দেয়।
		const res = await axios.get(`${API_BASE}/api/instagram/category`, {
			params: { category: categoryKey, limit: 20 },
			timeout: 90000 // একাধিক profile/hashtag try করতে পারে বলে সময় একটু বেশি দেওয়া
		});
		videos = Array.isArray(res.data?.posts) ? res.data.posts : [];
	} catch (err) {
		// সার্ভার 404 মানে এই category-র কোনো configured profile/hashtag-ই
		// কাজ করেনি এই মুহূর্তে — এটা normal "no result" অবস্থা, raw error না।
		if (err.response?.status === 404) return null;
		throw err;
	}

	if (videos.length === 0) return null;

	// সাম্প্রতিক পাঠানো ভিডিওগুলো বাদ দিয়ে বাছাই করার চেষ্টা করো — পুরো pool
	// টাই "recently sent" হয়ে থাকলে (ছোট pool), বাধ্য হয়ে সবগুলো থেকেই বাছাই
	// করা হবে, তবু repeat হওয়ার চেয়ে ভালো।
	const fresh = videos.filter((v) => !wasRecentlySent(categoryKey, v.id));
	const pool = fresh.length > 0 ? fresh : videos;

	const chosen = pool[Math.floor(Math.random() * pool.length)];
	rememberSent(categoryKey, chosen.id);
	return chosen;
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
		version: "2.1.0",
		author: "Riyad",
		countDown: 8,
		role: 0,
		category: "media",
		shortDescription: "Instagram category video (sad/funny/caption/lyrics/90s/etc)",
		longDescription: "Random Instagram video by category. Use {pn} to see the menu, or {pn} <category> directly (e.g. insta sad).",
		guide: "{pn} — menu দেখাবে, রিপ্লাই এ নাম্বার দিলে সেই ক্যাটাগরির ভিডিও আসবে।\n{pn} <category> — সরাসরি সেই ক্যাটাগরির ভিডিও আনবে (যেমন: insta sad)"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;
		const query = args.join(" ").trim();

		// ── সরাসরি: "insta sad" / "insta funny" / "insta lyrics" ────────
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
				const video = await fetchRandomVideo(category.key);
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
			const video = await fetchRandomVideo(category.key);
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
