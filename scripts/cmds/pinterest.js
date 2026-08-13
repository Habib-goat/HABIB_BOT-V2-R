const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const replyManager = require("../replies/replyManager");

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

// ─────────────────────────────────────────────
//  BUILD NUMBERED GRID COLLAGE
//  Downloads each image, lays them out in a grid, and stamps a big
//  numbered badge (1, 2, 3...) in the corner of every cell so the user
//  can reply with that number to get the full image.
// ─────────────────────────────────────────────
async function buildCollage(imageUrls) {
	const n = imageUrls.length;
	const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
	const rows = Math.ceil(n / cols);

	const cellSize = 380;
	const gap = 8;
	const width = cols * cellSize + (cols + 1) * gap;
	const height = rows * cellSize + (rows + 1) * gap;

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#111111";
	ctx.fillRect(0, 0, width, height);

	const images = await Promise.all(
		imageUrls.map(async (url) => {
			try {
				const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
				return await loadImage(Buffer.from(res.data));
			} catch (e) {
				return null;
			}
		})
	);

	images.forEach((img, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = gap + col * (cellSize + gap);
		const y = gap + row * (cellSize + gap);

		// cell background
		ctx.fillStyle = "#222222";
		ctx.fillRect(x, y, cellSize, cellSize);

		if (img) {
			// cover-fit crop into the square cell
			const scale = Math.max(cellSize / img.width, cellSize / img.height);
			const drawW = img.width * scale;
			const drawH = img.height * scale;
			const dx = x + (cellSize - drawW) / 2;
			const dy = y + (cellSize - drawH) / 2;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y, cellSize, cellSize);
			ctx.clip();
			ctx.drawImage(img, dx, dy, drawW, drawH);
			ctx.restore();
		} else {
			ctx.fillStyle = "#666666";
			ctx.font = "28px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Failed", x + cellSize / 2, y + cellSize / 2);
		}

		// number badge (top-left of cell)
		const badgeR = 34;
		const bx = x + badgeR + 10;
		const by = y + badgeR + 10;
		ctx.beginPath();
		ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
		ctx.fillStyle = "rgba(0,0,0,0.75)";
		ctx.fill();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 3;
		ctx.stroke();

		ctx.fillStyle = "#ffffff";
		ctx.font = "bold 34px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(i + 1), bx, by + 2);
	});

	return canvas.encode("png");
}

module.exports = {
	config: {
		name: "pin",
		aliases: ["pinterest", "pic"],
		version: "2.0.0",
		author: "RiYad",
		countDown: 10,
		role: 0,
		description: "Search Pinterest images — pick one by number to get it full-size",
		category: "image gen",
		guide: "{pn} <query> - <amount>: (Ex: {pn} goku - 10)"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID, senderID } = event;

		const queryAndLength = args.join(" ").split("-");
		const keySearch = queryAndLength[0]?.trim();
		const count = queryAndLength[1]?.trim();
		const numberSearch = count ? Math.min(parseInt(count), 20) : 6;

		if (!keySearch) {
			return api.sendMessage("× Baby, please enter a search query and amount! 🔍\nExample: pin goku - 10", threadID, messageID);
		}

		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

		const hasReaction = typeof api.setMessageReaction === "function";
		let collagePath;

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const response = await axios.get(`${await baseApiUrl()}/api/pin/mahmud?query=${encodeURIComponent(keySearch)}&limit=${numberSearch}`);

			const data = response.data.images;
			if (!data || data.length === 0) {
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				return api.sendMessage("× Sorry, no images found for your query.", threadID, messageID);
			}

			const pngBuffer = await buildCollage(data);
			collagePath = path.join(cacheDir, `pin_collage_${Date.now()}.png`);
			await fs.outputFile(collagePath, pngBuffer);

			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(
				{
					body: `🔎 | Pinterest results for "${keySearch}" (${data.length} images)\n\n👉 Reply with a number (1-${data.length}) to get that image full-size.`,
					attachment: fs.createReadStream(collagePath)
				},
				threadID,
				(err, info) => {
					if (collagePath && fs.existsSync(collagePath)) fs.remove(collagePath).catch(() => {});
					if (!err && info?.messageID) {
						replyManager.set(info.messageID, {
							commandName: this.config.name,
							author: senderID,
							images: data,
							query: keySearch
						});
					}
				},
				messageID
			);
		} catch (err) {
			if (collagePath && fs.existsSync(collagePath)) fs.remove(collagePath).catch(() => {});
			console.error("Pinterest Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.\n•WhatsApp: 01836298139`, threadID, messageID);
		}
	},

	onReply: async function ({ api, event, Reply }) {
		const { threadID, messageID, senderID, body } = event;

		if (senderID !== Reply.author) return;

		const hasReaction = typeof api.setMessageReaction === "function";
		const choice = parseInt(body);

		if (isNaN(choice) || choice < 1 || choice > Reply.images.length) {
			return api.sendMessage(
				`❌ | Invalid choice. Reply with a number between 1 and ${Reply.images.length}.`,
				threadID,
				messageID
			);
		}

		const imageUrl = Reply.images[choice - 1];
		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
		const filePath = path.join(cacheDir, `pin_full_${Date.now()}.jpg`);

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 20000 });
			await fs.outputFile(filePath, imgRes.data);

			return api.sendMessage(
				{
					body: `✅ | Image #${choice} for "${Reply.query}"`,
					attachment: fs.createReadStream(filePath)
				},
				threadID,
				() => {
					if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
					if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
				},
				messageID
			);
		} catch (err) {
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× Failed to fetch that image: ${err.message}`, threadID, messageID);
		}
	}
};
