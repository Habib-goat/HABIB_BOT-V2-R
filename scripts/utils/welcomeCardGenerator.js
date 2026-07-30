/**
 * Welcome Card Generator (RIYAD BOT)
 * ------------------------------------------------------------
 * Generates a "New Member" welcome image (PNG) like the sample
 * designs, using node-canvas. Supports Bangla + English text,
 * fetches the member's real profile picture when possible, and
 * randomly rotates between 4 color themes (Gold / Red / Cyan /
 * Purple) every time a new member joins.
 *
 * Requirements (add to package.json — already done):
 *   "canvas": "^2.11.2"
 *
 * System fonts required on the server (see Dockerfile):
 *   fonts-noto (covers Bengali) + a Latin display font (bundled
 *   locally under scripts/utils/fonts/ so it works everywhere).
 * ------------------------------------------------------------
 */

const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

// ---------- Font registration ---------------------------------------------
// Bundled fonts (English display font). Bangla text relies on a system
// Bangla-capable font (installed via apt in the Docker image: fonts-noto).
// If you want a custom Bangla font, drop a .ttf into ./fonts and register it
// below the same way.
const FONT_DIR = path.join(__dirname, "fonts");
const englishFontPath = path.join(FONT_DIR, "Poppins-Bold.ttf");
const englishRegularPath = path.join(FONT_DIR, "Poppins-Regular.ttf");
const banglaFontPath = path.join(FONT_DIR, "HindSiliguri-Bold.ttf");
const banglaRegularPath = path.join(FONT_DIR, "HindSiliguri-Regular.ttf");

let FONT_TITLE = "sans-serif";
let FONT_BODY = "sans-serif";

function safeRegister(fontPath, family, weight) {
  try {
    if (fs.existsSync(fontPath)) {
      registerFont(fontPath, { family, weight: weight || "normal" });
      return true;
    }
  } catch (e) {
    console.error("[WelcomeCard] Font register failed:", fontPath, e.message);
  }
  return false;
}

// Try bundled fonts first; fall back to generic family names that
// fontconfig/Pango will resolve to whatever Bangla+Latin fonts are
// installed on the system (e.g. Noto Sans Bengali via apt).
if (safeRegister(englishFontPath, "RiyadDisplay", "bold")) {
  FONT_TITLE = "RiyadDisplay";
} else {
  FONT_TITLE = "sans-serif";
}
if (safeRegister(englishRegularPath, "RiyadBody", "normal")) {
  FONT_BODY = "RiyadBody";
} else {
  FONT_BODY = "sans-serif";
}
safeRegister(banglaFontPath, "RiyadBangla", "bold");
safeRegister(banglaRegularPath, "RiyadBangla", "normal");

// A combined font stack so a single draw call renders both Bangla and
// English glyphs correctly (canvas/Pango will pick the right font per
// glyph run when multiple families are listed).
const TITLE_STACK = `"RiyadDisplay","RiyadBangla","Noto Sans Bengali","sans-serif"`;
const BODY_STACK = `"RiyadBody","RiyadBangla","Noto Sans Bengali","sans-serif"`;

// ---------- Themes -----------------------------------------------------
const THEMES = [
  { name: "gold", primary: "#F5B301", secondary: "#FFD84D", bg: "#0a0e1a", text: "#F5B301" },
  { name: "red", primary: "#E8232A", secondary: "#FF4D53", bg: "#100404", text: "#E8232A" },
  { name: "cyan", primary: "#1EC8E0", secondary: "#5FF1FF", bg: "#03080f", text: "#1EC8E0" },
  { name: "purple", primary: "#8B3DF2", secondary: "#C77DFF", bg: "#0a0614", text: "#C240D6" }
];

function pickTheme(seed) {
  if (typeof seed === "number") return THEMES[Math.abs(seed) % THEMES.length];
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

// ---------- Helpers ------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWatermark(ctx, W, H, color) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 26px ${TITLE_STACK}`;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.15);
  ctx.translate(-W / 2, -H / 2);
  const text = "RIYAD HASAN   ";
  const spacing = 260;
  for (let y = -100; y < H + 200; y += 90) {
    let full = "";
    while (ctx.measureText(full).width < W + 400) full += text;
    ctx.fillText(full, -200, y);
  }
  ctx.restore();
}

function drawShards(ctx, W, H, color) {
  // Decorative angular shards, top-right + corners, echoing the sample art.
  const draw = (pts, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  draw([[W - 420, -20], [W + 20, -20], [W - 60, 260]], 0.9);
  draw([[W - 260, -20], [W + 20, 40], [W - 340, 300]], 0.5);
  draw([[W - 40, 120], [W + 20, 340], [W - 160, 300]], 0.35);

  draw([[-20, H - 260], [180, H + 20], [-20, H + 20]], 0.6);
  draw([[-20, H - 380], [100, H - 340], [-20, H - 120]], 0.3);

  draw([[W - 60, H - 220], [W + 20, H - 300], [W + 20, H + 20], [W - 180, H + 20]], 0.4);
}

async function loadAvatar(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const img = await loadImage(avatarUrl);
    return img;
  } catch (e) {
    console.error("[WelcomeCard] Failed to load avatar:", e.message);
    return null;
  }
}

function drawDefaultAvatar(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#2b2f3a";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "#9aa0ac";
  // head
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.28, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.95, r * 0.72, Math.PI, 0, false);
  ctx.fill();
  ctx.restore();
}

async function drawAvatar(ctx, avatarUrl, cx, cy, r, theme) {
  // Glow rings
  ctx.save();
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur = 35;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  const img = await loadAvatar(avatarUrl);
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // cover-fit
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
    ctx.restore();
  } else {
    drawDefaultAvatar(ctx, cx, cy, r);
  }
}

/**
 * Generate a welcome card PNG buffer.
 * @param {Object} opts
 * @param {string} opts.memberName
 * @param {string} opts.groupName
 * @param {string|number} opts.memberId
 * @param {string} opts.addedBy
 * @param {string} [opts.avatarUrl]
 * @param {number} [opts.themeSeed] - pass a number to deterministically pick a theme (e.g. cycle), omit for random
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateWelcomeCard(opts) {
  const {
    memberName = "New Member",
    groupName = "Group Chat",
    memberId = "-",
    addedBy = "Unknown",
    avatarUrl = null,
    themeSeed = null
  } = opts;

  const theme = pickTheme(themeSeed);

  const W = 1536;
  const H = 1024;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, theme.bg);
  bgGrad.addColorStop(1, "#000000");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawWatermark(ctx, W, H, theme.primary);
  drawShards(ctx, W, H, theme.primary);

  // Outer glowing border
  ctx.save();
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur = 25;
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 6;
  roundRect(ctx, 14, 14, W - 28, H - 28, 24);
  ctx.stroke();
  ctx.restore();

  // Avatar
  const avatarCx = 300;
  const avatarCy = 330;
  const avatarR = 195;
  await drawAvatar(ctx, avatarUrl, avatarCx, avatarCy, avatarR, theme);

  // "NEW MEMBER" pill
  const pillX = 575;
  const pillY = 190;
  const pillW = 420;
  const pillH = 66;
  ctx.save();
  ctx.fillStyle = theme.primary;
  roundRect(ctx, pillX, pillY, pillW, pillH, 33);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.font = `bold 32px ${TITLE_STACK}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("🎉 NEW MEMBER 🎉", pillX + pillW / 2, pillY + pillH / 2 + 2);
  ctx.restore();

  // Member name
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let nameSize = 74;
  ctx.font = `bold ${nameSize}px ${TITLE_STACK}`;
  const maxNameWidth = W - pillX - 60;
  while (ctx.measureText(memberName).width > maxNameWidth && nameSize > 34) {
    nameSize -= 4;
    ctx.font = `bold ${nameSize}px ${TITLE_STACK}`;
  }
  ctx.fillText(memberName, pillX, 355);
  ctx.restore();

  // "joined <group>"
  ctx.save();
  ctx.fillStyle = theme.text;
  ctx.font = `600 34px ${BODY_STACK}`;
  ctx.fillText(`joined  ${groupName}`, pillX, 415);
  ctx.restore();

  // underline accent
  ctx.save();
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(pillX, 440);
  ctx.lineTo(pillX + 190, 440);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pillX + 210, 440, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.primary;
  ctx.fill();
  ctx.restore();

  // Bottom info bar
  const barX = 90;
  const barY = 660;
  const barW = W - 180;
  const barH = 200;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, barX, barY, barW, barH, 22);
  ctx.fill();
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 2;
  roundRect(ctx, barX, barY, barW, barH, 22);
  ctx.stroke();
  ctx.restore();

  const cols = [
    { label: "Member ID", value: `#${memberId}` },
    { label: "Added By", value: addedBy || "Unknown" },
    { label: "Group", value: groupName }
  ];
  const colW = barW / 3;
  cols.forEach((col, i) => {
    const cx0 = barX + colW * i + 55;
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "#c7cad1";
    ctx.font = `400 26px ${BODY_STACK}`;
    ctx.fillText(col.label, cx0, barY + 78);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 36px ${TITLE_STACK}`;
    let val = String(col.value);
    const maxW = colW - 90;
    while (ctx.measureText(val).width > maxW && val.length > 4) {
      val = val.slice(0, -2);
    }
    if (val !== String(col.value)) val += "…";
    ctx.fillText(val, cx0, barY + 122);

    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx0, barY + 140);
    ctx.lineTo(cx0 + 60, barY + 140);
    ctx.stroke();

    if (i < cols.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX + colW * (i + 1), barY + 30);
      ctx.lineTo(barX + colW * (i + 1), barY + barH - 30);
      ctx.stroke();
    }
    ctx.restore();
  });

  // Bottom-right branding
  const logoPath = path.join(__dirname, "..", "..", "assets", "logo.png");
  const logoCx = W - 130;
  const logoCy = H - 150;
  const logoR = 56;
  ctx.save();
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  try {
    if (fs.existsSync(logoPath)) {
      const logoImg = await loadImage(logoPath);
      ctx.save();
      ctx.beginPath();
      ctx.arc(logoCx, logoCy, logoR - 4, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max((logoR * 2) / logoImg.width, (logoR * 2) / logoImg.height);
      const iw = logoImg.width * scale;
      const ih = logoImg.height * scale;
      ctx.drawImage(logoImg, logoCx - iw / 2, logoCy - ih / 2, iw, ih);
      ctx.restore();
    }
  } catch (_) {}

  ctx.save();
  ctx.textAlign = "right";
  const rightEdge = logoCx - logoR - 24;
  ctx.fillStyle = theme.primary;
  ctx.font = `bold 26px ${TITLE_STACK}`;
  ctx.fillText("RIYAD BOT", rightEdge, H - 100);
  const botWidth = ctx.measureText("RIYAD BOT").width;
  ctx.fillStyle = "#d8d8d8";
  ctx.font = `400 26px ${BODY_STACK}`;
  ctx.fillText("POWERED BY ", rightEdge - botWidth, H - 100);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = { generateWelcomeCard, THEMES };
