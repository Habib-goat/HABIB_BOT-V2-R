/**
 * Welcome Card Generator (RIYAD BOT)
 * ─────────────────────────────────────────────────────────────────
 *  Generates a "New Member" welcome PNG that exactly matches the
 *  four reference card designs:
 *    · Purple  (deep purple/violet neon)
 *    · Gold    (black + amber/gold neon)
 *    · Cyan    (dark navy + cyan/teal neon)
 *    · Red     (dark + crimson/red neon)
 *
 *  Each theme uses:
 *    – Diagonal RIYAD HASAN watermark across the whole background
 *    – Sharp geometric crystal-shard decorations in corners
 *    – Circular avatar with glowing neon ring + white inner ring
 *    – "⊠ NEW MEMBER ⊠" pill badge in the theme colour
 *    – Large white member name + "joined <group>" in accent colour
 *    – Horizontal accent underline + dot
 *    – Dark rounded info bar (Member ID | Added By | Group)
 *    – Bottom-right circular logo + "POWERED BY RIYAD BOT"
 *
 *  Depends on:  canvas ^2.11.2   (already in package.json)
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs   = require("fs");

// ─── Font registration ────────────────────────────────────────────
const FONT_DIR = path.join(__dirname, "fonts");

function safeRegisterFont(filePath, family, weight) {
  try {
    if (fs.existsSync(filePath)) {
      registerFont(filePath, { family, weight: weight || "normal" });
      return true;
    }
  } catch (_) {}
  return false;
}

safeRegisterFont(path.join(FONT_DIR, "Poppins-Bold.ttf"),         "RiyadDisplay", "bold");
safeRegisterFont(path.join(FONT_DIR, "Poppins-Regular.ttf"),      "RiyadBody",    "normal");
safeRegisterFont(path.join(FONT_DIR, "HindSiliguri-Bold.ttf"),    "RiyadBangla",  "bold");
safeRegisterFont(path.join(FONT_DIR, "HindSiliguri-Regular.ttf"), "RiyadBangla",  "normal");

// Font stacks – Pango picks the right glyph run per script automatically
const FONT_BOLD = `"RiyadDisplay","RiyadBangla","Noto Sans Bengali","DejaVu Sans","sans-serif"`;
const FONT_REG  = `"RiyadBody","RiyadBangla","Noto Sans Bengali","DejaVu Sans","sans-serif"`;

// ─── Colour themes ────────────────────────────────────────────────
// Each exactly mirrors one of the four reference card designs.
const THEMES = [
  {
    name:        "purple",
    bg:          "#08051a",          // very dark purple-navy
    bgMid:       "#0e0824",
    primary:     "#7B2FBE",          // purple
    glow:        "#a050ff",          // brighter purple for glow/shadow
    accent:      "#cc44dd",          // pink-purple for "joined" text & underline
    pillBg:      "#7B2FBE",
    pillText:    "#ffffff",
  },
  {
    name:        "gold",
    bg:          "#090700",          // very dark near-black
    bgMid:       "#100e00",
    primary:     "#D4920A",          // gold/amber
    glow:        "#ffcc00",          // bright gold glow
    accent:      "#F5B301",          // warm gold for "joined" text
    pillBg:      "#C98B00",
    pillText:    "#000000",
  },
  {
    name:        "cyan",
    bg:          "#030b10",          // very dark navy
    bgMid:       "#051520",
    primary:     "#0099B0",          // teal/cyan
    glow:        "#00e5ff",          // bright cyan glow
    accent:      "#00C8E0",          // cyan for "joined" text
    pillBg:      "#007B8A",
    pillText:    "#000000",
  },
  {
    name:        "red",
    bg:          "#0e0303",          // very dark near-black with red tint
    bgMid:       "#180505",
    primary:     "#BE0000",          // deep red
    glow:        "#ff1a1a",          // bright red glow
    accent:      "#dd1111",          // red for "joined" text
    pillBg:      "#AA0000",
    pillText:    "#ffffff",
  },
];

function pickTheme(seed) {
  if (typeof seed === "number") return THEMES[Math.abs(seed) % THEMES.length];
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

// ─── Utility helpers ──────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ─── Background ───────────────────────────────────────────────────
function drawBackground(ctx, W, H, theme) {
  // Base dark gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,   theme.bg);
  grad.addColorStop(0.5, theme.bgMid);
  grad.addColorStop(1,   "#000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial glow in top-right (where shards are)
  const trGlow = ctx.createRadialGradient(W * 0.82, H * 0.15, 0, W * 0.82, H * 0.15, W * 0.55);
  trGlow.addColorStop(0, hexToRgba(theme.primary, 0.22));
  trGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = trGlow;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial glow from avatar area (top-left)
  const avGlow = ctx.createRadialGradient(210, 250, 0, 210, 250, 320);
  avGlow.addColorStop(0, hexToRgba(theme.primary, 0.12));
  avGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = avGlow;
  ctx.fillRect(0, 0, W, H);
}

// ─── Diagonal watermark ───────────────────────────────────────────
function drawWatermark(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle   = "#ffffff";
  ctx.font        = `bold 26px ${FONT_BOLD}`;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 12); // –15°
  ctx.translate(-W / 2, -H / 2);
  const stamp = "RIYAD HASAN  ";
  const rowH  = 88;
  for (let row = -2; row < Math.ceil(H / rowH) + 3; row++) {
    const y = row * rowH;
    let x = -300;
    while (x < W + 400) {
      ctx.fillText(stamp, x, y);
      x += ctx.measureText(stamp).width;
    }
  }
  ctx.restore();
}

// ─── Crystal-shard corner decorations ────────────────────────────
//  These are the most iconic visual element — sharp triangular spikes
//  radiating inward from the corners, with neon glow matching the theme.
function drawShards(ctx, W, H, theme) {
  const primary = theme.primary;
  const glow    = theme.glow;

  // Draw one shard triangle with optional neon glow
  function shard(pts, alpha, glowing, brightColor) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glowing) {
      ctx.shadowColor = brightColor || glow;
      ctx.shadowBlur  = 22;
    }
    // Gradient from bright tip to darker base
    const x0 = pts[0][0], y0 = pts[0][1];
    const x1 = pts[pts.length - 1][0], y1 = pts[pts.length - 1][1];
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, glow);
    g.addColorStop(1, primary);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  // ── TOP-RIGHT cluster (4 triangular spikes) ────────────────────
  //  Spike 1 – large dominant triangle
  shard([[W - 310, -8], [W + 8, -8], [W - 40, 205]], 0.95, true, glow);
  //  Spike 2 – behind spike 1, slightly rotated left
  shard([[W - 210, -8], [W + 8, 55], [W - 310, 235]], 0.60, true, glow);
  //  Spike 3 – narrow spike pointing down-left
  shard([[W - 35,  130], [W + 8, 300], [W - 130, 270]], 0.52, false);
  //  Spike 4 – small accent shard
  shard([[W - 80,  210], [W + 8, 230], [W - 55, 340]], 0.32, false);

  // ── LEFT edge shards (near avatar) ────────────────────────────
  shard([[-8, 55], [130, -8], [105, 145]], 0.72, true, glow);
  shard([[-8, 175], [75, 140], [-8, 305]], 0.38, false);

  // ── BOTTOM-LEFT corner ─────────────────────────────────────────
  shard([[-8, H - 215], [145, H + 8], [-8, H + 8]], 0.65, true, glow);
  shard([[-8, H - 350], [65, H - 315], [-8, H - 145]], 0.32, false);

  // ── BOTTOM-RIGHT corner ────────────────────────────────────────
  shard([[W - 125, H + 8], [W + 8, H - 195], [W + 8, H + 8]], 0.48, true, glow);
  shard([[W - 55, H - 255], [W + 8, H - 295], [W + 8, H - 110]], 0.30, false);

  // ── Dot scatter – top-right area ──────────────────────────────
  ctx.save();
  ctx.fillStyle   = glow;
  ctx.globalAlpha = 0.55;
  for (let dx = 0; dx < 6; dx++) {
    for (let dy = 0; dy < 5; dy++) {
      if ((dx + dy) % 2 === 0) {
        ctx.beginPath();
        ctx.arc(W - 375 + dx * 19, 55 + dy * 19, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // ── Dot scatter – bottom-left area ────────────────────────────
  ctx.save();
  ctx.fillStyle   = glow;
  ctx.globalAlpha = 0.50;
  for (let dx = 0; dx < 5; dx++) {
    for (let dy = 0; dy < 4; dy++) {
      if ((dx + dy) % 2 === 0) {
        ctx.beginPath();
        ctx.arc(18 + dx * 19, H - 90 + dy * 19, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ─── Default avatar silhouette ────────────────────────────────────
function drawDefaultAvatar(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // dark background disc
  ctx.fillStyle = "#252830";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // head
  ctx.fillStyle = "#9aa0ac";
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.26, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.88, r * 0.68, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

// ─── Avatar with neon ring ────────────────────────────────────────
async function drawAvatar(ctx, avatarUrl, cx, cy, r, theme) {
  // Outer neon glow ring
  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur  = 45;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 17, 0, Math.PI * 2);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth   = 7;
  ctx.stroke();
  ctx.restore();

  // White inner ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth   = 4;
  ctx.stroke();
  ctx.restore();

  // Avatar image
  let drawn = false;
  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
      ctx.drawImage(img, cx - img.width * scale / 2, cy - img.height * scale / 2,
                    img.width * scale, img.height * scale);
      ctx.restore();
      drawn = true;
    } catch (_) {}
  }
  if (!drawn) drawDefaultAvatar(ctx, cx, cy, r);
}

// ─── Main generator ───────────────────────────────────────────────
/**
 * @param {object}  opts
 * @param {string}  opts.memberName
 * @param {string}  opts.groupName
 * @param {string|number} opts.memberId
 * @param {string}  opts.addedBy
 * @param {string}  [opts.avatarUrl]
 * @param {number}  [opts.themeSeed]  — integer → picks deterministically; omit → random
 * @returns {Promise<Buffer>}          PNG image buffer
 */
async function generateWelcomeCard(opts) {
  const {
    memberName = "New Member",
    groupName  = "Group Chat",
    memberId   = "-",
    addedBy    = "Unknown",
    avatarUrl  = null,
    themeSeed  = null,
  } = opts;

  const theme = pickTheme(themeSeed);

  // Canvas — 16:9-ish landscape matching the reference card size
  const W = 1040;
  const H = 580;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // ── 1. Background ──────────────────────────────────────────────
  drawBackground(ctx, W, H, theme);

  // ── 2. Watermark ───────────────────────────────────────────────
  drawWatermark(ctx, W, H);

  // ── 3. Crystal shards ──────────────────────────────────────────
  drawShards(ctx, W, H, theme);

  // ── 4. Avatar (left side) ──────────────────────────────────────
  const avCx = 210;
  const avCy = 255;
  const avR  = 148;
  await drawAvatar(ctx, avatarUrl, avCx, avCy, avR, theme);

  // ── 5. "NEW MEMBER" pill badge ─────────────────────────────────
  const pillW = 274;
  const pillH = 48;
  // Centre the pill horizontally in the right 60 % of the card
  const pillX = 430 + Math.round(((W - 430) - pillW) / 2);
  const pillY = 88;

  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur  = 18;
  roundRect(ctx, pillX, pillY, pillW, pillH, 24);
  ctx.fillStyle = theme.pillBg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle     = theme.pillText;
  ctx.font          = `bold 22px ${FONT_BOLD}`;
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.fillText("⊠ NEW MEMBER ⊠", pillX + pillW / 2, pillY + pillH / 2 + 1);
  ctx.restore();

  // ── 6. Member name ─────────────────────────────────────────────
  const textX = 430;
  ctx.save();
  ctx.fillStyle    = "#ffffff";
  ctx.textAlign    = "left";
  ctx.textBaseline = "alphabetic";

  // Scale font down if name is very long
  let nameSize = 70;
  ctx.font = `bold ${nameSize}px ${FONT_BOLD}`;
  const maxNameW = W - textX - 55;
  while (ctx.measureText(memberName).width > maxNameW && nameSize > 34) {
    nameSize -= 3;
    ctx.font = `bold ${nameSize}px ${FONT_BOLD}`;
  }
  ctx.fillText(memberName, textX, 258);
  ctx.restore();

  // ── 7. "joined <group>" ────────────────────────────────────────
  ctx.save();
  ctx.fillStyle    = "#ffffff";          // white in all themes (matches designs)
  ctx.font         = `500 28px ${FONT_REG}`;
  ctx.textAlign    = "left";
  ctx.textBaseline = "alphabetic";

  let joinText = `joined  ${groupName}`;
  const maxJoinW = W - textX - 55;
  while (ctx.measureText(joinText).width > maxJoinW && groupName.length > 5) {
    joinText = joinText.slice(0, -1);
  }
  if (joinText !== `joined  ${groupName}`) joinText += "…";
  ctx.fillText(joinText, textX, 305);
  ctx.restore();

  // ── 8. Accent underline + dot ──────────────────────────────────
  ctx.save();
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth   = 4;
  ctx.lineCap     = "round";
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(textX,       330);
  ctx.lineTo(textX + 150, 330);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(textX + 166, 330, 5, 0, Math.PI * 2);
  ctx.fillStyle = theme.primary;
  ctx.fill();
  ctx.restore();

  // ── 9. Bottom info bar ─────────────────────────────────────────
  const barX = 38;
  const barY = 415;
  const barW = W - 76;
  const barH = 126;

  ctx.save();
  roundRect(ctx, barX, barY, barW, barH, 18);
  ctx.fillStyle = "rgba(8,8,16,0.80)";
  ctx.fill();
  ctx.strokeStyle = hexToRgba(theme.primary, 0.35);
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  const columns = [
    { label: "Member ID", value: `#${memberId}` },
    { label: "Added By",  value: String(addedBy  || "Unknown") },
    { label: "Group",     value: String(groupName || "Chat")   },
  ];
  const colW = barW / 3;

  columns.forEach((col, i) => {
    const cx0 = barX + colW * i + 38;

    // Label (small, muted)
    ctx.save();
    ctx.fillStyle    = "#9ea3b0";
    ctx.font         = `400 19px ${FONT_REG}`;
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(col.label, cx0, barY + 48);
    ctx.restore();

    // Value (large, white bold) — truncate if needed
    ctx.save();
    ctx.fillStyle    = "#ffffff";
    ctx.font         = `bold 30px ${FONT_BOLD}`;
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    let val = col.value;
    const maxVW = colW - 60;
    while (ctx.measureText(val).width > maxVW && val.length > 2) {
      val = val.slice(0, -1);
    }
    if (val !== col.value) val += "…";
    ctx.fillText(val, cx0, barY + 90);
    ctx.restore();

    // Vertical divider between columns
    if (i < columns.length - 1) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(barX + colW * (i + 1), barY + 20);
      ctx.lineTo(barX + colW * (i + 1), barY + barH - 20);
      ctx.stroke();
      ctx.restore();
    }
  });

  // ── 10. Bottom-right branding: logo circle + text ───────────────
  const logoCx = W - 68;
  const logoCy = H - 62;
  const logoR  = 44;

  // Glowing border ring around logo
  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur  = 14;
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth   = 3;
  ctx.stroke();
  ctx.restore();

  // Logo image (circular clip)
  const logoPath = path.join(__dirname, "..", "..", "assets", "logo.png");
  try {
    if (fs.existsSync(logoPath)) {
      const logoImg = await loadImage(logoPath);
      ctx.save();
      ctx.beginPath();
      ctx.arc(logoCx, logoCy, logoR - 3, 0, Math.PI * 2);
      ctx.clip();
      const s  = Math.max((logoR * 2) / logoImg.width, (logoR * 2) / logoImg.height);
      ctx.drawImage(logoImg,
        logoCx - logoImg.width  * s / 2,
        logoCy - logoImg.height * s / 2,
        logoImg.width * s, logoImg.height * s);
      ctx.restore();
    }
  } catch (_) {}

  // "POWERED BY RIYAD BOT" — right-aligned, beside the logo
  ctx.save();
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  const brandY     = logoCy;
  const rightEdge  = logoCx - logoR - 12;

  // "RIYAD BOT" in accent colour
  ctx.font      = `bold 21px ${FONT_BOLD}`;
  ctx.fillStyle = theme.glow;
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 8;
  const botLabelW = ctx.measureText("RIYAD BOT").width;
  ctx.fillText("RIYAD BOT", rightEdge, brandY);

  // "POWERED BY " in white
  ctx.font      = `400 21px ${FONT_REG}`;
  ctx.fillStyle = "#cccccc";
  ctx.shadowBlur = 0;
  ctx.fillText("POWERED BY ", rightEdge - botLabelW, brandY);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = { generateWelcomeCard, THEMES };
