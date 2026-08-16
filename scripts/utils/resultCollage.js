"use strict";

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const PADDING = 16;
// The collage thumbnail is only drawn at 220x124, so downloading a large
// max-resolution thumbnail adds latency without improving the visible result.
const THUMB_TIMEOUT = 2500;
const imageCache = new Map();
const collageCache = new Map();
const COLLAGE_CACHE_TTL = 5 * 60 * 1000;

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
  }
} catch (_) {
  // The system font is still useful for English titles when the optional
  // Bengali fonts have not been copied into this folder.
}

const ACCENTS = [
  "#e63946",
  "#3d8bfd",
  "#9b59f6",
  "#2ec4b6",
  "#f0a500",
  "#8e44ec",
];

function isYouTubeId(value) {
  return /^[\w-]{11}$/.test(String(value || ""));
}

function isVideo(item) {
  return Boolean(
    item &&
      (item.isVideo ||
        item.videoUrl ||
        item.type === "video" ||
        /\.(mp4|m3u8|mov|m4v|webm|gif)(?:[?#].*)?$/i.test(
          String(item.image || item.thumbnail || item.video || ""),
        )),
  );
}

function thumbnailCandidates(item, variant) {
  const candidates = [];

  if (variant === "youtube" && isYouTubeId(item?.id)) {
    // mqdefault is already 16:9 and is much smaller/faster than maxresdefault.
    candidates.push(`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`);
    candidates.push(`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`);
    candidates.push(`https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`);
  }

  for (const value of [
    item?.thumbnail,
    item?.thumb,
    item?.image,
    item?.thumbnailUrl,
    item?.cover,
  ]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      candidates.push(value);
    }
  }

  return [...new Set(candidates)];
}

async function fetchImage(url) {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) {
    return cached.image;
  }

  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: THUMB_TIMEOUT,
      maxContentLength: 3 * 1024 * 1024,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const image = await loadImage(Buffer.from(response.data));
    imageCache.set(url, { image, createdAt: Date.now() });
    if (imageCache.size > 150) {
      imageCache.delete(imageCache.keys().next().value);
    }
    return image;
  } catch (_) {
    return null;
  }
}

async function fetchFirstImage(item, variant) {
  for (const url of thumbnailCandidates(item, variant)) {
    const image = await fetchImage(url);
    if (image) return image;
  }
  return null;
}

function collageCacheKey(variant, items, options) {
  return JSON.stringify({
    variant,
    options: {
      headerTitle: options.headerTitle || "",
      footerText: options.footerText || "",
    },
    items: items.map((item) => ({
      id: item?.id || "",
      title: item?.title || "",
      duration: item?.duration || "",
      thumbnail: item?.thumbnail || item?.image || "",
      videoUrl: item?.videoUrl || "",
      isVideo: Boolean(item?.isVideo),
    })),
  });
}

function getCachedCollage(key) {
  const entry = collageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > COLLAGE_CACHE_TTL) {
    collageCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCachedCollage(key, buffer) {
  collageCache.set(key, { buffer, createdAt: Date.now() });
  if (collageCache.size > 40) {
    collageCache.delete(collageCache.keys().next().value);
  }
  return buffer;
}

function truncate(ctx, text, maxWidth) {
  const value = String(text || "Untitled");
  if (ctx.measureText(value).width <= maxWidth) return value;

  let output = value;
  while (output.length && ctx.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}…`;
}

function drawCover(ctx, image, x, y, width, height) {
  if (!image) {
    ctx.fillStyle = "#2a2a32";
    ctx.fillRect(x, y, width, height);
    return;
  }

  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(
    image,
    x - (drawWidth - width) / 2,
    y - (drawHeight - height) / 2,
    drawWidth,
    drawHeight,
  );
}

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawPlayButton(ctx, cx, cy, radius, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();

  const size = radius * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy - size);
  ctx.lineTo(cx - size * 0.4, cy + size);
  ctx.lineTo(cx + size * 0.9, cy);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function drawMusicNote(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + size, size * 0.45, size * 0.32, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + size * 0.4, y - size * 1.2, size * 0.14, size * 2.1);
}

function drawPulseIcon(ctx, x, y, width, height, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + height / 2);
  ctx.lineTo(x + width * 0.25, y + height / 2);
  ctx.lineTo(x + width * 0.38, y);
  ctx.lineTo(x + width * 0.55, y + height);
  ctx.lineTo(x + width * 0.68, y + height / 2);
  ctx.lineTo(x + width, y + height / 2);
  ctx.stroke();
}

function drawThreeDots(ctx, x, y, gap, color) {
  ctx.fillStyle = color;
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath();
    ctx.arc(x, y + index * gap, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWaveform(ctx, x, y, width, height, color, seed) {
  const bars = 26;
  const barWidth = width / bars;
  let randomSeed = seed;
  const random = () => {
    randomSeed = (randomSeed * 9301 + 49297) % 233280;
    return randomSeed / 233280;
  };

  ctx.fillStyle = color;
  for (let index = 0; index < bars; index += 1) {
    const barHeight = Math.max(3, random() * height);
    ctx.fillRect(
      x + index * barWidth,
      y + (height - barHeight) / 2,
      barWidth * 0.55,
      barHeight,
    );
  }
}

function drawHeader(ctx, width, title, count, countColor = "#3d8bfd") {
  const gradient = ctx.createLinearGradient(56, 0, 400, 0);
  gradient.addColorStop(0, "#ff3d81");
  gradient.addColorStop(1, "#9b59f6");

  drawMusicNote(ctx, 24, 40, 12, "#ff3d81");
  ctx.font = `bold 34px ${fontFamilyBold}`;
  ctx.fillStyle = gradient;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, 62, 60);

  const countText = `${count} results found`;
  ctx.font = `20px ${fontFamily}`;
  const countTextWidth = ctx.measureText(countText).width;
  drawPulseIcon(
    ctx,
    width - 40 - countTextWidth - 46,
    38,
    40,
    16,
    countColor,
  );
  ctx.fillStyle = "#c9c9d2";
  ctx.textAlign = "right";
  ctx.fillText(countText, width - 40, 52);
}

function drawYoutubeCollageItem(ctx, item, image, index, layout) {
  const accent = ACCENTS[index % ACCENTS.length];
  const { rowX, rowY, rowWidth, rowHeight } = layout;
  const thumbX = rowX + 90;
  const thumbY = rowY + (rowHeight - layout.thumbHeight) / 2;

  roundRectPath(ctx, rowX, rowY, rowWidth, rowHeight, 18);
  ctx.fillStyle = "#15151b";
  ctx.fill();

  roundRectPath(ctx, rowX, rowY, 6, rowHeight, 3);
  ctx.fillStyle = accent;
  ctx.fill();

  const badgeCx = rowX + 46;
  const badgeCy = rowY + rowHeight / 2 - 55;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, 22, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.font = `bold 20px ${fontFamilyBold}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(index + 1), badgeCx, badgeCy + 1);
  ctx.textBaseline = "alphabetic";

  roundRectPath(
    ctx,
    thumbX,
    thumbY,
    layout.thumbWidth,
    layout.thumbHeight,
    14,
  );
  ctx.save();
  ctx.clip();
  drawCover(ctx, image, thumbX, thumbY, layout.thumbWidth, layout.thumbHeight);
  ctx.restore();
  drawPlayButton(
    ctx,
    thumbX + layout.thumbWidth / 2,
    thumbY + layout.thumbHeight / 2,
    28,
    accent,
  );

  const textX = thumbX + layout.thumbWidth + 45;
  const contentRight = rowX + rowWidth - 50;
  const maxTextWidth = contentRight - textX;

  ctx.font = `bold 24px ${fontFamilyBold}`;
  ctx.fillStyle = "#f5f5f7";
  ctx.textAlign = "left";
  ctx.fillText(
    truncate(ctx, item.title || "Untitled", maxTextWidth),
    textX,
    rowY + 48,
  );

  drawMusicNote(ctx, textX, rowY + 68, 7, "#9a9aa6");
  ctx.font = `18px ${fontFamily}`;
  ctx.fillStyle = "#9a9aa6";
  ctx.fillText(
    truncate(
      ctx,
      item.author || item.uploader || "Unknown Artist",
      maxTextWidth - 30,
    ),
    textX + 26,
    rowY + 78,
  );

  const duration = item.duration || "--:--";
  ctx.font = `bold 17px ${fontFamilyBold}`;
  const pillWidth = ctx.measureText(duration).width + 28;
  roundRectPath(ctx, textX, rowY + 96, pillWidth, 30, 15);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillText(duration, textX + 14, rowY + 117);

  drawWaveform(
    ctx,
    contentRight - 210,
    rowY + rowHeight / 2 + 30,
    190,
    34,
    `${accent}aa`,
    index + 7,
  );
  drawThreeDots(ctx, contentRight + 20, rowY + rowHeight / 2 - 8, 9, "#6b6b76");
}

async function buildYoutubeCollage(results, options = {}) {
  const items = (results || []).slice(0, 10);
  const cacheKey = collageCacheKey("youtube", items, options);
  const cached = getCachedCollage(cacheKey);
  if (cached) return cached;

  const headerTitle = options.headerTitle || "RIYAD BOT";
  const footerText = options.footerText || "Enjoy your music";
  const width = 1180;
  const headerHeight = 90;
  const footerHeight = 56;
  const rowHeight = 200;
  const thumbWidth = 220;
  const thumbHeight = 124; // 16:9, unlike the old square thumbnail.
  const height =
    headerHeight + items.length * (rowHeight + PADDING) + footerHeight + PADDING;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0c0c10";
  ctx.fillRect(0, 0, width, height);
  drawHeader(ctx, width, headerTitle, items.length);

  const images = await Promise.all(
    items.map((item) => fetchFirstImage(item, "youtube")),
  );

  let y = headerHeight;
  for (let index = 0; index < items.length; index += 1) {
    drawYoutubeCollageItem(ctx, items[index], images[index], index, {
      rowX: 40,
      rowY: y,
      rowWidth: width - 80,
      rowHeight,
      thumbWidth,
      thumbHeight,
    });
    y += rowHeight + PADDING;
  }

  const footerY = y + 10;
  ctx.font = `bold 20px ${fontFamilyBold}`;
  ctx.fillStyle = "#e0e0e6";
  ctx.textAlign = "center";
  ctx.fillText(footerText, width / 2, footerY + 22);
  return setCachedCollage(cacheKey, await canvas.encode("png"));
}

function drawWrappedTitle(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "Untitled").split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(truncate(ctx, word, maxWidth));
      current = "";
    }
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    lines[maxLines - 1] = truncate(ctx, `${lines[maxLines - 1]}…`, maxWidth);
  }

  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

async function buildPinterestCollage(results, options = {}) {
  const items = (results || []).slice(0, 10);
  const cacheKey = collageCacheKey("pinterest", items, options);
  const cached = getCachedCollage(cacheKey);
  if (cached) return cached;

  const headerTitle = options.headerTitle || "PINTEREST";
  const width = 1180;
  const headerHeight = 90;
  const footerHeight = 42;
  const columns = 2;
  const cardGap = 18;
  const cardWidth = (width - 80 - cardGap) / columns;
  const cardHeight = 216;
  const thumbSize = 172; // 1:1 Pinterest result tile.
  const rows = Math.ceil(items.length / columns);
  const height =
    headerHeight + rows * cardHeight + Math.max(0, rows - 1) * cardGap +
    footerHeight + PADDING;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0c0c10";
  ctx.fillRect(0, 0, width, height);
  drawHeader(ctx, width, headerTitle, items.length, "#ff3d81");

  const images = await Promise.all(
    items.map((item) => fetchFirstImage(item, "pinterest")),
  );

  for (let index = 0; index < items.length; index += 1) {
    const accent = ACCENTS[index % ACCENTS.length];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 40 + column * (cardWidth + cardGap);
    const y = headerHeight + row * (cardHeight + cardGap);

    roundRectPath(ctx, x, y, cardWidth, cardHeight, 16);
    ctx.fillStyle = "#15151b";
    ctx.fill();
    roundRectPath(ctx, x, y, 5, cardHeight, 2);
    ctx.fillStyle = accent;
    ctx.fill();

    const numberX = x + 27;
    const numberY = y + 28;
    ctx.beginPath();
    ctx.arc(numberX, numberY, 17, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.font = `bold 16px ${fontFamilyBold}`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), numberX, numberY + 1);
    ctx.textBaseline = "alphabetic";

    const imageX = x + 52;
    const imageY = y + (cardHeight - thumbSize) / 2;
    roundRectPath(ctx, imageX, imageY, thumbSize, thumbSize, 12);
    ctx.save();
    ctx.clip();
    drawCover(ctx, images[index], imageX, imageY, thumbSize, thumbSize);
    ctx.restore();
    if (isVideo(items[index])) {
      drawPlayButton(
        ctx,
        imageX + thumbSize / 2,
        imageY + thumbSize / 2,
        25,
        accent,
      );
    }

    const textX = imageX + thumbSize + 22;
    const textWidth = x + cardWidth - 22 - textX;
    ctx.textAlign = "left";
    ctx.font = `bold 20px ${fontFamilyBold}`;
    ctx.fillStyle = "#f5f5f7";
    drawWrappedTitle(
      ctx,
      items[index].title || "Untitled",
      textX,
      y + 58,
      textWidth,
      27,
      4,
    );

    if (isVideo(items[index])) {
      const duration = items[index].duration || "--:--";
      ctx.font = `bold 16px ${fontFamilyBold}`;
      const pillWidth = ctx.measureText(duration).width + 24;
      roundRectPath(ctx, textX, y + 160, pillWidth, 28, 14);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillText(duration, textX + 12, y + 180);
    }
  }

  ctx.font = `bold 18px ${fontFamilyBold}`;
  ctx.fillStyle = "#9a9aa6";
  ctx.textAlign = "center";
  ctx.fillText("Pinterest results", width / 2, height - 18);
  return setCachedCollage(cacheKey, await canvas.encode("png"));
}

/**
 * Builds the YouTube collage by default. Use { variant: "pinterest" } for
 * Pinterest's separate 2-column, 5-row result collage.
 */
async function buildResultCollage(results = [], options = {}) {
  if (options.variant === "pinterest") {
    return buildPinterestCollage(results, options);
  }
  return buildYoutubeCollage(results, options);
}

module.exports = {
  buildResultCollage,
  buildYoutubeCollage,
  buildPinterestCollage,
};
