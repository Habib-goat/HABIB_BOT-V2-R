/**
 * Riyad Bot Framework
 *
 * Two features:
 *  1. `pin <query>` — search up to 10 pins, send ONE numbered collage image,
 *     then send the HD image/video for the selected number after a 1-10 reply.
 *  2. Auto-download — any message (anywhere, no command needed) containing a
 *     pinterest.com/pin/... or pin.it/... link gets its HD image/video sent
 *     back automatically.
 */
"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const replyManager = require("../replies/replyManager");
const { search, getMediaById, resolveUrl } = require("../utils/riyadPinterestApi");
const { buildResultCollage } = require("../utils/resultCollage");

const PIN_LINK_RE = /(https?:\/\/(?:[\w-]+\.)?pinterest\.[a-z.]+\/pin\/\d+[^\s]*|https?:\/\/pin\.it\/[^\s]+)/i;

function react(api, emoji, messageID) {
	if (typeof api.setMessageReaction === "function") {
		api.setMessageReaction(emoji, messageID, () => {}, true);
	}
}

async function downloadToFile(url, filePath, timeout = 60000) {
	const res = await axios.get(url, {
		responseType: "arraybuffer",
		timeout,
		headers: { "User-Agent": "Mozilla/5.0" }
	});
	fs.writeFileSync(filePath, res.data);
}

// ─────────────────────────────────────────────
//  FIX: sendMessage(attachment) via this library occasionally fails
//  ("Mercury upload metadata[0] missing" over MQTT, then an HTTP fallback
//  that itself can time out with a 408). This isn't caused by our code —
//  the download itself succeeds every time — it's flakiness in the
//  underlying messenger library's upload path. Retrying the SEND a couple
//  of times (re-using the same already-downloaded file, no re-download)
//  clears it in most cases instead of the message just silently never
//  arriving.
// ─────────────────────────────────────────────
function sendMessageWithRetry(api, payload, threadID, messageID, attempts = 3, delayMs = 2500) {
	return new Promise((resolve, reject) => {
		let tries = 0;

		const attempt = () => {
			tries++;
			api.sendMessage(
				payload,
				threadID,
				(err, info) => {
					if (!err) return resolve(info);

					console.error(`[PIN SEND] attempt ${tries}/${attempts} failed:`, err.message || err);
					if (tries >= attempts) return reject(err);
					setTimeout(attempt, delayMs);
				},
				messageID
			);
		};

		attempt();
	});
}

async function sendMedia(api, media, threadID, messageID, cacheDir) {
	if (!media || (!media.image && !media.videoUrl)) {
		react(api, "❌", messageID);
		return api.sendMessage("❌ Couldn't resolve HD media for that pin.", threadID, messageID);
	}

	const isVideo = !!media.videoUrl;
	const ext = isVideo ? "mp4" : "jpg";
	const url = isVideo ? media.videoUrl : media.image;
	const filePath = path.join(cacheDir, `pin_${Date.now()}.${ext}`);

	react(api, "⏳", messageID);
	try {
		await downloadToFile(url, filePath);

		const info = await sendMessageWithRetry(
			api,
			{ body: `✅ | ${media.title || "Pinterest"}${isVideo ? " (video)" : " (HD image)"}`, attachment: fs.createReadStream(filePath) },
			threadID,
			messageID
		);

		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		react(api, "✅", messageID);
		return info;
	} catch (err) {
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		react(api, "❌", messageID);
		console.error("[PIN DOWNLOAD ERROR]", err.message);
		return api.sendMessage(`❌ Download failed: ${err.message}`, threadID, messageID);
	}
}

module.exports = {
	config: {
		name: "pin",
		aliases: ["pinterest", "pic"],
		version: "4.0.1",
		author: "Riyad",
		countDown: 10,
		role: 0,
		category: "image",
		shortDescription: "Search Pinterest images/videos, or auto-download any Pinterest link",
		guide: { en: "{pn} <query> — reply with 1-10 to get HD\nOr just paste any pinterest.com/pin.it link to auto-download it." }
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;

		const query = args.join(" ").trim();
		if (!query) {
			return api.sendMessage("❌ Usage: pin <query>\nExample: pin sunset wallpaper", threadID, messageID);
		}

		const cacheDir = path.join(__dirname, "cache");
		fs.mkdirSync(cacheDir, { recursive: true });
		react(api, "⏳", messageID);

		let collagePath;
		try {
			const results = await search(query, 10);
			if (!results.length) {
				react(api, "❌", messageID);
				return api.sendMessage(`❌ "${query}" এর জন্য কোনো ফলাফল পাওয়া যায়নি।`, threadID, messageID);
			}

			// resultCollage.js expects { title, thumbnail } — Pinterest results use "image"
			const forCollage = results.map(r => ({ title: r.title, thumbnail: r.image }));
			const pngBuffer = await buildResultCollage(forCollage);
			collagePath = path.join(cacheDir, `pin_collage_${Date.now()}.png`);
			fs.writeFileSync(collagePath, pngBuffer);
			react(api, "✅", messageID);

			return api.sendMessage(
				{
					body: `📌 | "${query}" এর জন্য ${results.length}টি ফলাফল\n\n👉 Reply with a number (1-${results.length}) to get the HD image/video.`,
					attachment: fs.createReadStream(collagePath)
				},
				threadID,
				(err, info) => {
					if (collagePath && fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
					if (!err && info?.messageID) {
						replyManager.set(info.messageID, {
							commandName: this.config.name,
							author: senderID,
							results,
							query
						});
					}
				},
				messageID
			);
		} catch (err) {
			if (collagePath && fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
			react(api, "❌", messageID);
			console.error("[PIN ERROR]", err.message);
			return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
		}
	},

	onReply: async function ({ api, event, Reply }) {
		const { threadID, messageID, senderID } = event;
		if (String(senderID) !== String(Reply.author)) return;

		const choice = parseInt(String(event.body || "").trim(), 10);
		if (isNaN(choice) || choice < 1 || choice > Reply.results.length) {
			return api.sendMessage(`❌ Reply with a number between 1 and ${Reply.results.length}.`, threadID, messageID);
		}

		const selected = Reply.results[choice - 1];
		const cacheDir = path.join(__dirname, "cache");
		fs.mkdirSync(cacheDir, { recursive: true });

		try {
			// Re-fetch by ID to make sure we have the best available resolution
			const media = await getMediaById(selected.id);
			return sendMedia(api, media, threadID, messageID, cacheDir);
		} catch (err) {
			react(api, "❌", messageID);
			return api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
		}
	},

	// Auto-download: fires on every regular message, no command needed
	onChat: async function ({ api, event }) {
		const text = event.body;
		if (!text) return;

		const match = text.match(PIN_LINK_RE);
		if (!match) return;

		const { threadID, messageID } = event;
		const cacheDir = path.join(__dirname, "cache");
		fs.mkdirSync(cacheDir, { recursive: true });

		react(api, "⏳", messageID);
		try {
			const media = await resolveUrl(match[0]);
			return sendMedia(api, media, threadID, messageID, cacheDir);
		} catch (err) {
			react(api, "❌", messageID);
			console.error("[PIN AUTO-DOWNLOAD ERROR]", err.message);
			return api.sendMessage(`❌ Couldn't process that Pinterest link: ${err.message}`, threadID, messageID);
		}
	}
};
