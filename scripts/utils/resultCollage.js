"use strict";

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const ROW_H = 200;
const PADDING = 16;
const THUMB_SIZE = 150;
const THUMB_TIMEOUT = 4500;
const imageCache = new Map();

// ─────────────────────────────────────────────
//  Bangla font — REQUIRED for Bangla titles to render correctly.
//  Without a registered font that includes Bengali glyphs, Bangla text
//  draws as empty boxes ("tofu"). Download these two files from Google
//  Fonts (free, no signup): https://fonts.google.com/noto/specimen/Noto+Sans+Bengali
//  and place them at the paths below, relative to this file:
//
//    scripts/utils/fonts/NotoSansBengali-Regular.ttf
//    scripts/utils/fonts/NotoSansBengali-Bold.ttf
//
//  If they're missing, collages still render (with a console warning) —
//  English titles look fine, but Bangla titles will show as boxes.
// ─────────────────────────────────────────────
const FONT_DIR = path.join(__dirname, "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "NotoSansBengali-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSansBengali-Bold.ttf");

let fontFamily = "sans-serif";
let fontFamilyBold = "sans-serif";

try {
	if (fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
		GlobalFonts.registerFromPath(FONT_REGULAR, "NotoBengali");
		GlobalFonts.registerFromPath(FONT_BOLD, "NotoBengaliBold");
		fontFamily = "NotoBengali";
		fontFamilyBold = "NotoBengaliBold";
		console.log("✅ Bangla font loaded for result collages.");
	} else {
		console.warn("⚠️ Bangla font files not found in scripts/utils/fonts/ — Bangla titles will render as boxes. See resultCollage.js header comment.");
	}
} catch (e) {
	console.warn("⚠️ Failed to register Bangla font:", e.message);
}

// Accent color palette — cycles per row (matches the reference design's
// red/blue/purple/teal/orange/violet rotation)
const ACCENTS = [
	{ main: "#e63946" },
	{ main: "#3d8bfd" },
	{ main: "#9b59f6" },
	{ main: "#2ec4b6" },
	{ main: "#f0a500" },
	{ main: "#8e44ec" }
];

function imageUrl(item) {
	if (item.id && /^[\w-]{11}$/.test(String(item.id))) {
		return `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
	}
	return item.thumbnail || item.thumb || item.image || null;
}

async function fetchImage(url) {
	if (!url) return null;
	const cached = imageCache.get(url);
	if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) return cached.image;
	try {
		const response = await axios.get(url, {
			responseType: "arraybuffer",
			timeout: THUMB_TIMEOUT,
			maxContentLength: 2 * 1024 * 1024
		});
		const image = await loadImage(Buffer.from(response.data));
		imageCache.set(url, { image, createdAt: Date.now() });
		if (imageCache.size > 100) imageCache.delete(imageCache.keys().next().value);
		return image;
	} catch (_) {
		return null;
	}
}

function truncate(ctx, text, maxWidth) {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let output = String(text);
	while (output.length && ctx.measureText(`${output}…`).width > maxWidth) {
		output = output.slice(0, -1);
	}
	return `${output}…`;
}

function roundRectPath(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// ── Decorative vector icons (no emoji — avoids missing-glyph boxes) ──

function drawPlayButton(ctx, cx, cy, radius, color) {
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.lineWidth = 3;
	ctx.strokeStyle = color;
	ctx.stroke();

	const s = radius * 0.55;
	ctx.beginPath();
	ctx.moveTo(cx - s * 0.4, cy - s);
	ctx.lineTo(cx - s * 0.4, cy + s);
	ctx.lineTo(cx + s * 0.9, cy);
	ctx.closePath();
	ctx.fillStyle = "#ffffff";
	ctx.fill();
}

function drawMusicNote(ctx, x, y, size, color) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.ellipse(x, y + size, size * 0.45, size * 0.32, -0.3, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(x + size * 1.3, y + size * 0.7, size * 0.45, size * 0.32, -0.3, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillRect(x + size * 0.4, y - size * 1.2, size * 0.14, size * 2.1);
	ctx.fillRect(x + size * 1.7, y - size * 1.5, size * 0.14, size * 2.1);
	ctx.beginPath();
	ctx.moveTo(x + size * 0.4, y - size * 1.2);
	ctx.lineTo(x + size * 1.84, y - size * 1.5);
	ctx.lineTo(x + size * 1.84, y - size * 0.9);
	ctx.lineTo(x + size * 0.4, y - size * 0.6);
	ctx.closePath();
	ctx.fill();
}

function drawThreeDots(ctx, x, y, gap, color) {
	ctx.fillStyle = color;
	for (let i = 0; i < 3; i++) {
		ctx.beginPath();
		ctx.arc(x, y + i * gap, 2.6, 0, Math.PI * 2);
		ctx.fill();
	}
}

function drawWaveform(ctx, x, y, w, h, color, seed) {
	const bars = 26;
	const bw = w / bars;
	let rnd = seed;
	const rand = () => {
		rnd = (rnd * 9301 + 49297) % 233280;
		return rnd / 233280;
	};
	ctx.fillStyle = color;
	for (let i = 0; i < bars; i++) {
		const bh = Math.max(3, rand() * h);
		ctx.fillRect(x + i * bw, y + (h - bh) / 2, bw * 0.55, bh);
	}
}

function drawPulseIcon(ctx, x, y, w, h, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(x, y + h / 2);
	ctx.lineTo(x + w * 0.25, y + h / 2);
	ctx.lineTo(x + w * 0.38, y);
	ctx.lineTo(x + w * 0.55, y + h);
	ctx.lineTo(x + w * 0.68, y + h / 2);
	ctx.lineTo(x + w, y + h / 2);
	ctx.stroke();
}

function drawHeadphones(ctx, cx, cy, size, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.arc(cx, cy, size, Math.PI, 0, false);
	ctx.stroke();
	ctx.fillStyle = color;
	roundRectPath(ctx, cx - size - 4, cy - 4, 10, 20, 4);
	ctx.fill();
	roundRectPath(ctx, cx + size - 6, cy - 4, 10, 20, 4);
	ctx.fill();
}

function drawHeart(ctx, cx, cy, size, color) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(cx, cy + size * 0.3);
	ctx.bezierCurveTo(cx - size, cy - size * 0.6, cx - size * 1.6, cy + size * 0.5, cx, cy + size * 1.3);
	ctx.bezierCurveTo(cx + size * 1.6, cy + size * 0.5, cx + size, cy - size * 0.6, cx, cy + size * 0.3);
	ctx.fill();
}

/**
 * @param {Array<{id, title, thumbnail, duration, author}>} results
 * @param {Object} [options]
 * @param {string} [options.headerTitle="RIYAD BOT"]
 * @param {string} [options.footerText="Enjoy your music"]
 * @returns {Promise<Buffer>} PNG buffer
 */
async function buildResultCollage(results = [], options = {}) {
	const {
		headerTitle = "RIYAD BOT",
		footerText = "Enjoy your music"
	} = options;

	const items = results.slice(0, 10);
	const HEADER_H = 90;
	const FOOTER_H = 56;
	const W = 1180;
	const H = HEADER_H + items.length * (ROW_H + PADDING) + FOOTER_H + PADDING;

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");

	// background
	ctx.fillStyle = "#0c0c10";
	ctx.fillRect(0, 0, W, H);

	// ── Header ──
	const grad = ctx.createLinearGradient(56, 0, 400, 0);
	grad.addColorStop(0, "#ff3d81");
	grad.addColorStop(1, "#9b59f6");
	drawMusicNote(ctx, 24, 40, 12, "#ff3d81");
	ctx.font = `bold 34px ${fontFamilyBold}`;
	ctx.fillStyle = grad;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(headerTitle, 62, 60);

	const countText = `${items.length} results found`;
	ctx.font = `20px ${fontFamily}`;
	const countTextWidth = ctx.measureText(countText).width;
	drawPulseIcon(ctx, W - 40 - countTextWidth - 46, 38, 40, 16, "#3d8bfd");
	ctx.fillStyle = "#c9c9d2";
	ctx.textAlign = "right";
	ctx.fillText(countText, W - 40, 52);

	// preload thumbnails in parallel
	const images = await Promise.all(items.map((item) => fetchImage(imageUrl(item))));

	let y = HEADER_H;
	for (let i = 0; i < items.length; i++) {
		const accent = ACCENTS[i % ACCENTS.length];
		const rowX = 40;
		const rowW = W - 80;
		const rowY = y;

		// card background
		roundRectPath(ctx, rowX, rowY, rowW, ROW_H, 18);
		ctx.fillStyle = "#15151b";
		ctx.fill();

		// left accent bar
		roundRectPath(ctx, rowX, rowY, 6, ROW_H, 3);
		ctx.fillStyle = accent.main;
		ctx.fill();

		// number badge
		const badgeCx = rowX + 46;
		const badgeCy = rowY + ROW_H / 2 - 55;
		ctx.beginPath();
		ctx.arc(badgeCx, badgeCy, 22, 0, Math.PI * 2);
		ctx.fillStyle = accent.main;
		ctx.fill();
		ctx.font = `bold 20px ${fontFamilyBold}`;
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(i + 1), badgeCx, badgeCy + 1);
		ctx.textBaseline = "alphabetic";

		// thumbnail (rounded)
		const thumbX = rowX + 90;
		const thumbY = rowY + (ROW_H - THUMB_SIZE) / 2;
		roundRectPath(ctx, thumbX, thumbY, THUMB_SIZE, THUMB_SIZE, 14);
		ctx.save();
		ctx.clip();
		if (images[i]) {
			const img = images[i];
			const scale = Math.max(THUMB_SIZE / img.width, THUMB_SIZE / img.height);
			const dw = img.width * scale;
			const dh = img.height * scale;
			ctx.drawImage(img, thumbX - (dw - THUMB_SIZE) / 2, thumbY - (dh - THUMB_SIZE) / 2, dw, dh);
		} else {
			ctx.fillStyle = "#2a2a32";
			ctx.fillRect(thumbX, thumbY, THUMB_SIZE, THUMB_SIZE);
		}
		ctx.restore();

		// play button, centered on the thumbnail
		drawPlayButton(ctx, thumbX + THUMB_SIZE / 2, thumbY + THUMB_SIZE / 2, 34, accent.main);

		// text column
		const textX = thumbX + THUMB_SIZE + 190;
		const contentRight = rowX + rowW - 50;
		const maxTextWidth = contentRight - textX;

		ctx.font = `bold 24px ${fontFamilyBold}`;
		ctx.fillStyle = "#f5f5f7";
		ctx.textAlign = "left";
		const title = truncate(ctx, items[i].title || "Untitled", maxTextWidth);
		ctx.fillText(title, textX, rowY + 48);

		drawMusicNote(ctx, textX, rowY + 68, 7, "#9a9aa6");
		ctx.font = `18px ${fontFamily}`;
		ctx.fillStyle = "#9a9aa6";
		const author = truncate(ctx, items[i].author || items[i].uploader || "Unknown Artist", maxTextWidth - 30);
		ctx.fillText(author, textX + 26, rowY + 78);

		// duration pill
		const dur = items[i].duration || "--:--";
		ctx.font = `bold 17px ${fontFamilyBold}`;
		const pillW = ctx.measureText(dur).width + 28;
		const pillX = textX;
		const pillY = rowY + 96;
		roundRectPath(ctx, pillX, pillY, pillW, 30, 15);
		ctx.strokeStyle = accent.main;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		ctx.fillStyle = accent.main;
		ctx.textAlign = "left";
		ctx.fillText(dur, pillX + 14, pillY + 21);

		// decorative waveform
		drawWaveform(ctx, contentRight - 210, rowY + ROW_H / 2 + 30, 190, 34, accent.main + "aa", i + 7);

		// three-dot menu icon, far right
		drawThreeDots(ctx, contentRight + 20, rowY + ROW_H / 2 - 8, 9, "#6b6b76");

		y += ROW_H + PADDING;
	}

	// ── Footer ──
	const footerY = y + 10;
	drawHeadphones(ctx, W / 2 - 90, footerY + 14, 14, "#c9c9d2");
	drawHeart(ctx, W / 2 - 40, footerY + 6, 9, "#e63946");
	ctx.font = `bold 20px ${fontFamilyBold}`;
	ctx.fillStyle = "#e0e0e6";
	ctx.textAlign = "left";
	ctx.fillText(footerText, W / 2 - 20, footerY + 22);
	drawHeart(ctx, W / 2 - 20 + ctx.measureText(footerText).width + 20, footerY + 6, 9, "#e63946");

	return canvas.encode("png");
}

module.exports = { buildResultCollage };
