const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");
const os = require("os");

function drawFireBubble(text) {
	const width = 700;
	const height = 220;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");

	// Transparent background
	ctx.clearRect(0, 0, width, height);

	// --- Bubble geometry ---
	const bubbleX = 40;
	const bubbleY = 50;
	const bubbleW = width - 80;
	const bubbleH = 100;
	const radius = 45;

	// Speech-bubble tail (small triangle at bottom-left)
	function roundedBubblePath() {
		ctx.beginPath();
		ctx.moveTo(bubbleX + radius, bubbleY);
		ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
		ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius);
		ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
		ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH);
		ctx.lineTo(bubbleX + radius + 40, bubbleY + bubbleH);
		// tail
		ctx.lineTo(bubbleX + 10, bubbleY + bubbleH + 25);
		ctx.lineTo(bubbleX + 30, bubbleY + bubbleH);
		ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
		ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius);
		ctx.lineTo(bubbleX, bubbleY + radius);
		ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
		ctx.closePath();
	}

	// Outer glow (soft fire aura)
	ctx.save();
	roundedBubblePath();
	ctx.shadowColor = "rgba(255,120,0,0.9)";
	ctx.shadowBlur = 35;
	const grad = ctx.createLinearGradient(bubbleX, bubbleY, bubbleX + bubbleW, bubbleY + bubbleH);
	grad.addColorStop(0, "#FF7A00");
	grad.addColorStop(0.5, "#FF9500");
	grad.addColorStop(1, "#FFB700");
	ctx.fillStyle = grad;
	ctx.fill();
	ctx.restore();

	// White border ring
	roundedBubblePath();
	ctx.lineWidth = 4;
	ctx.strokeStyle = "rgba(255,255,255,0.85)";
	ctx.stroke();

	// --- Text ---
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	let fontSize = 34;
	ctx.font = `bold ${fontSize}px sans-serif`;
	// shrink font until text fits width
	while (ctx.measureText(text).width > bubbleW - 60 && fontSize > 14) {
		fontSize -= 2;
		ctx.font = `bold ${fontSize}px sans-serif`;
	}
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = 6;
	ctx.fillText(text, bubbleX + bubbleW / 2, bubbleY + bubbleH / 2, bubbleW - 40);
	ctx.shadowBlur = 0;

	// --- Little flame icon accents on the corners ---
	function drawFlame(cx, cy, scale) {
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(scale, scale);
		ctx.beginPath();
		ctx.moveTo(0, -20);
		ctx.bezierCurveTo(12, -8, 10, 5, 0, 20);
		ctx.bezierCurveTo(-10, 5, -12, -8, 0, -20);
		ctx.closePath();
		const fg = ctx.createLinearGradient(0, -20, 0, 20);
		fg.addColorStop(0, "#FFD200");
		fg.addColorStop(1, "#FF3D00");
		ctx.fillStyle = fg;
		ctx.fill();
		ctx.restore();
	}
	drawFlame(bubbleX - 15, bubbleY + bubbleH / 2, 0.9);
	drawFlame(bubbleX + bubbleW + 15, bubbleY + bubbleH / 2, 0.9);

	return canvas;
}

module.exports = {
	config: {
		name: "fire",
		aliases: ["firemsg", "flame"],
		version: "2.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "Send a message as a fire-styled image bubble",
		category: "fun",
		guide: "{pn} <message>"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		const text = args.join(" ");
		if (!text) {
			return api.sendMessage("🔥 | Please provide a message.\nExample: fire hello everyone", threadID, messageID);
		}

		try {
			const canvas = drawFireBubble(text);
			const tmpPath = path.join(os.tmpdir(), `fire_${Date.now()}.png`);
			const out = fs.createWriteStream(tmpPath);
			const stream = canvas.createPNGStream();
			stream.pipe(out);

			out.on("finish", () => {
				api.sendMessage(
					{ attachment: fs.createReadStream(tmpPath) },
					threadID,
					(err) => {
						if (err) console.error("[fire] sendMessage failed:", err);
						fs.unlink(tmpPath, () => {});
					},
					messageID
				);
			});
		} catch (e) {
			console.error("[fire] canvas render failed:", e);
			api.sendMessage("❌ | Failed to generate fire image: " + (e?.message || e), threadID, messageID);
		}
	}
};
