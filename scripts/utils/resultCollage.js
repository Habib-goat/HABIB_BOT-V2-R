"use strict";

const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const COLS = 2;
const CELL_W = 300;
const CELL_H = 220;
const THUMB_H = 170;
const PADDING = 10;
const THUMB_TIMEOUT = 4500;
const imageCache = new Map();

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

async function buildResultCollage(results = []) {
  const items = results.slice(0, 10);
  const rows = Math.max(1, Math.ceil(items.length / COLS));
  const canvas = createCanvas(COLS * CELL_W, rows * CELL_H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // All thumbnails are attempted together and each has its own short
  // timeout, so one blocked pinimg/YouTube host cannot hold up the collage.
  const images = await Promise.all(items.map((item) => fetchImage(imageUrl(item))));

  for (let i = 0; i < items.length; i += 1) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;
    const thumbX = x + PADDING / 2;
    const thumbY = y + PADDING / 2;
    const thumbW = CELL_W - PADDING;

    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(thumbX, thumbY, thumbW, CELL_H - PADDING);
    if (images[i]) {
      const image = images[i];
      const scale = Math.max(thumbW / image.width, THUMB_H / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(thumbX, thumbY, thumbW, THUMB_H);
      ctx.clip();
      ctx.drawImage(image, thumbX - (drawW - thumbW) / 2, thumbY - (drawH - THUMB_H) / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#444";
      ctx.fillRect(thumbX, thumbY, thumbW, THUMB_H);
      ctx.fillStyle = "#aaa";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No image", thumbX + thumbW / 2, thumbY + THUMB_H / 2);
    }

    ctx.beginPath();
    ctx.arc(thumbX + 20, thumbY + 20, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#e63946";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), thumbX + 20, thumbY + 21);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#f1f1f1";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, items[i].title || "Untitled", thumbW - 10), thumbX + 5, thumbY + THUMB_H + 25);
  }
  return canvas.encode("png");
}

module.exports = { buildResultCollage };