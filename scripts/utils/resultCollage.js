/**
 * Riyad Bot Framework
 *
 * Builds a single collage PNG from up to 10 search results, each thumbnail
 * labeled with its number (1-10) and a short title underneath, so a user
 * can pick one by replying with the number.
 *
 * Uses @napi-rs/canvas instead of the "canvas" package — it ships prebuilt
 * binaries and works out of the box on Termux/Android (no cairo/pixman
 * native compilation needed).
 *
 * Expects each result to look like: { id, title, thumbnail } — adjust the
 * `thumbnail` field name below if your riyadVideoApi.js returns a
 * different key (e.g. thumb, image, cover).
 */
"use strict";

const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const COLS = 2;
const CELL_W = 300;
const CELL_H = 220;
const THUMB_H = 170;
const PADDING = 10;
const FONT = "20px sans-serif";

async function fetchImage(url) {
	try {
		const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
		return await loadImage(Buffer.from(res.data));
	} catch (err) {
		return null; // fall back to a blank cell if a thumbnail fails to load
	}
}

function truncate(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let out = text;
	while (out.length > 0 && ctx.measureText(out + "…").width > maxWidth) {
		out = out.slice(0, -1);
	}
	return out + "…";
}

/**
 * @param {Array<{id: string, title: string, thumbnail: string}>} results
 * @returns {Promise<Buffer>} PNG buffer
 */
async function buildResultCollage(results) {
	const items = results.slice(0, 10);
	const rows = Math.ceil(items.length / COLS);

	const canvasW = COLS * CELL_W;
	const canvasH = rows * CELL_H;

	const canvas = createCanvas(canvasW, canvasH);
	const ctx = canvas.getContext("2d");

	// background
	ctx.fillStyle = "#1e1e1e";
	ctx.fillRect(0, 0, canvasW, canvasH);

	// load all thumbnails in parallel
	const images = await Promise.all(items.map(item => fetchImage(item.thumbnail)));

	for (let i = 0; i < items.length; i++) {
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const x = col * CELL_W;
		const y = row * CELL_H;

		// cell background
		ctx.fillStyle = "#2b2b2b";
		ctx.fillRect(x + PADDING / 2, y + PADDING / 2, CELL_W - PADDING, CELL_H - PADDING);

		const thumbW = CELL_W - PADDING;
		const thumbX = x + PADDING / 2;
		const thumbY = y + PADDING / 2;

		if (images[i]) {
			// cover-fit the thumbnail into the cell (crop to aspect ratio)
			const img = images[i];
			const scale = Math.max(thumbW / img.width, THUMB_H / img.height);
			const drawW = img.width * scale;
			const drawH = img.height * scale;
			const dx = thumbX - (drawW - thumbW) / 2;
			const dy = thumbY - (drawH - THUMB_H) / 2;

			ctx.save();
			ctx.beginPath();
			ctx.rect(thumbX, thumbY, thumbW, THUMB_H);
			ctx.clip();
			ctx.drawImage(img, dx, dy, drawW, drawH);
			ctx.restore();
		} else {
			ctx.fillStyle = "#444";
			ctx.fillRect(thumbX, thumbY, thumbW, THUMB_H);
			ctx.fillStyle = "#999";
			ctx.font = FONT;
			ctx.textAlign = "center";
			ctx.fillText("No image", thumbX + thumbW / 2, thumbY + THUMB_H / 2);
		}

		// number badge (top-left of thumbnail)
		const badgeR = 16;
		ctx.beginPath();
		ctx.arc(thumbX + badgeR + 4, thumbY + badgeR + 4, badgeR, 0, Math.PI * 2);
		ctx.fillStyle = "#e63946";
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = "bold 18px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(i + 1), thumbX + badgeR + 4, thumbY + badgeR + 5);
		ctx.textBaseline = "alphabetic";

		// title
		ctx.fillStyle = "#f1f1f1";
		ctx.font = FONT;
		ctx.textAlign = "left";
		const title = truncate(ctx, items[i].title || "Untitled", CELL_W - PADDING - 10);
		ctx.fillText(title, thumbX + 5, thumbY + THUMB_H + 25);
	}

	return canvas.encode("png");
}

module.exports = { buildResultCollage };
