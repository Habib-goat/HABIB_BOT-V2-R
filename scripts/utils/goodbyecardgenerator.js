/**
 * goodbyecardgenerator.js
 * High-Quality Node.js Canvas Goodbye Card Generator
 * Matches the reference image style for RIYAD BOT.
 *
 * Drop into:  scripts/utils/goodbyecardgenerator.js
 *
 * Usage:
 *   const generateGoodbyeCard = require('../utils/goodbyecardgenerator');
 *   const buffer = await generateGoodbyeCard({
 *     memberName:    "Md Rakib Hasan",
 *     userId:        "61552000883437",
 *     groupName:     "Official Boot Group",
 *     leftBy:        "Md Rakib Hasan",
 *     leftOn:        new Date(),   // or pre-formatted string
 *     totalMembers:  "244",
 *     memberAvatarUrl: "https://...",   // member profile pic
 *     groupAvatarUrl:  "https://...",   // group photo
 *   });
 *
 * Returns a PNG Buffer.
 *
 * CommonJS (same structure as welcomeCardGenerator.js).
 * Uses the "canvas" npm package already listed in package.json.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── axios (already a project dep) ────────────────────────────────────────────
let axios = null;
try { axios = require('axios'); } catch (_) { /* fallback to loadImage(url) */ }

// ── canvas implementation (mirrors welcomeCardGenerator.js) ──────────────────
let createCanvas, loadImage, registerFont;
try {
  const napi = require('@napi-rs/canvas');
  createCanvas  = napi.createCanvas;
  loadImage     = napi.loadImage;
  registerFont  = napi.GlobalFonts
    ? (p, o) => napi.GlobalFonts.registerFromPath(p, o && o.family)
    : napi.registerFont;
} catch (_) {
  try {
    const c = require('canvas');
    createCanvas = c.createCanvas;
    loadImage    = c.loadImage;
    registerFont = c.registerFont;
  } catch (e) {
    throw new Error(
      'No canvas implementation found. Run:  npm install canvas'
    );
  }
}

// ── font registration (same fonts as welcomeCardGenerator) ───────────────────
let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;
  const dir = path.join(__dirname, 'fonts');
  const list = [
    { file: 'Poppins-Bold.ttf',          family: 'Poppins',         weight: 'bold'   },
    { file: 'Poppins-Regular.ttf',        family: 'Poppins',         weight: 'normal' },
    { file: 'HindSiliguri-Bold.ttf',      family: 'Hind Siliguri',   weight: 'bold'   },
    { file: 'HindSiliguri-Regular.ttf',   family: 'Hind Siliguri',   weight: 'normal' },
  ];
  for (const f of list) {
    try {
      const fp = path.join(dir, f.file);
      if (fs.existsSync(fp) && typeof registerFont === 'function') {
        registerFont(fp, { family: f.family, weight: f.weight });
      }
    } catch (err) {
      console.error('[goodbyecardgenerator] Font registration failed:', f.file, err?.message);
    }
  }
}

const FONT        = '"Hind Siliguri","Noto Sans Bengali","Segoe UI","Arial",sans-serif';
const FONT_BOLD   = '"Hind Siliguri","Noto Sans Bengali","Arial Black","Impact","Trebuchet MS",sans-serif';

// ── date formatter (Bangladesh Standard Time, same as welcomeCardGenerator) ──
function formatDate(input) {
  if (typeof input === 'string' && input.trim() !== '') return input;
  const d = input instanceof Date ? input : new Date();
  const v = isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(v);
  const g = (t) => parts.find(p => p.type === t)?.value || '';
  let hour = g('hour'), ampm = (g('dayPeriod') || '').toUpperCase();
  ampm = ampm.startsWith('P') ? 'PM' : 'AM';
  hour = String(hour).padStart(2, '0');
  return `${g('day')} ${g('month')} ${g('year')}, ${hour}:${g('minute')} ${ampm}`;
}

// ════════════════════════════════════════════════════════════════════════════
//  DRAWING HELPERS
// ════════════════════════════════════════════════════════════════════════════

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r,     y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x,     y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

function drawCross(ctx, cx, cy, size, thickness, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(cx - thickness / 2, cy - size / 2, thickness, size);
  ctx.fillRect(cx - size / 2,      cy - thickness / 2, size, thickness);
  ctx.restore();
}

function drawHeart(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  const tch = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy, cx - size / 2, cy - tch, cx - size / 2, cy + tch / 2);
  ctx.bezierCurveTo(cx - size / 2, cy + (size + tch) / 2, cx, cy + size * 0.8, cx, cy + size);
  ctx.bezierCurveTo(cx, cy + size * 0.8, cx + size / 2, cy + (size + tch) / 2, cx + size / 2, cy + tch / 2);
  ctx.bezierCurveTo(cx + size / 2, cy - tch, cx, cy, cx, cy + size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDiagonalStripes(ctx, x, y, count, spacing, len, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * spacing,        y);
    ctx.lineTo(x + i * spacing + len,  y - len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDotGrid(ctx, ox, oy, cols, rows, gap, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.beginPath();
      ctx.arc(ox + col * gap, oy + row * gap, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Vector row icons (blue version)
function drawRowIcon(ctx, type, x, y, size) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle   = '#ffffff';
  ctx.lineWidth   = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + size / 2, cy = y + size / 2;

  switch (type) {
    case 'person': {
      ctx.beginPath(); ctx.arc(cx, cy - 5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + 9, 9, Math.PI, Math.PI * 2); ctx.fill();
      break;
    }
    case 'id': {
      drawRoundedRect(ctx, cx - 11, cy - 9, 22, 18, 3); ctx.stroke();
      ctx.fillRect(cx - 8, cy - 5, 6, 6);
      ctx.fillRect(cx + 1, cy - 5, 6, 1.5);
      ctx.fillRect(cx + 1, cy - 2, 6, 1.5);
      ctx.fillRect(cx - 8, cy + 3, 15, 1.5);
      break;
    }
    case 'group': {
      ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 4, cy + 8, 7, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy + 8, 6, Math.PI, Math.PI * 2); ctx.fill();
      break;
    }
    case 'leftBy': {
      ctx.beginPath(); ctx.arc(cx - 3, cy - 4, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 3, cy + 8, 7.5, Math.PI, Math.PI * 2); ctx.fill();
      // Arrow pointing right (exit)
      ctx.beginPath();
      ctx.moveTo(cx + 4,  cy - 3);
      ctx.lineTo(cx + 11, cy);
      ctx.lineTo(cx + 4,  cy + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy);
      ctx.lineTo(cx + 11, cy);
      ctx.stroke();
      break;
    }
    case 'calendar': {
      drawRoundedRect(ctx, cx - 10, cy - 8, 20, 18, 3); ctx.stroke();
      ctx.fillRect(cx - 10, cy - 4, 20, 2);
      ctx.fillRect(cx - 6, cy - 10, 2, 3);
      ctx.fillRect(cx + 4, cy - 10, 2, 3);
      ctx.fillRect(cx - 6, cy,  3, 3);
      ctx.fillRect(cx - 1, cy,  3, 3);
      ctx.fillRect(cx + 4, cy,  3, 3);
      ctx.fillRect(cx - 6, cy + 4, 3, 3);
      ctx.fillRect(cx - 1, cy + 4, 3, 3);
      break;
    }
    case 'members': {
      ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 5, cy + 7, 6.5, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy + 7, 6.5, Math.PI, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// Default silhouette when no avatar loads
function drawDefaultAvatar(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#111827'; ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.75, r * 0.65, Math.PI, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Robust avatar loader: axios first, loadImage fallback
async function loadAvatarImage(url) {
  if (!url) return null;
  // Buffer input
  if (Buffer.isBuffer(url)) return loadImage(url);
  // Local file
  if (typeof url === 'string' && (url.startsWith('/') || url.startsWith('./') || url.startsWith('file://'))) {
    try { return await loadImage(url); } catch (_) { return null; }
  }
  // Remote URL via axios
  if (axios && typeof url === 'string') {
    try {
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RiyadBot/2.0)',
          'Accept': 'image/webp,image/png,image/jpeg,*/*',
        },
      });
      if (resp.data && resp.data.byteLength > 500) {
        return await loadImage(Buffer.from(resp.data));
      }
    } catch (_) { /* fall through */ }
  }
  // loadImage direct fallback
  try { return await loadImage(url); } catch (_) { return null; }
}

// Paper plane SVG-like path (decorative top-right)
function drawPaperPlane(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle   = color;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  const s = size;
  // Body triangle
  ctx.beginPath();
  ctx.moveTo(cx,        cy - s * 0.5);
  ctx.lineTo(cx + s,    cy);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.3);
  ctx.closePath();
  ctx.fill();
  // Tail flap
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.1, cy + s * 0.05);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.55);
  ctx.closePath();
  ctx.fillStyle = color + 'aa';
  ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN FUNCTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {string}          [opts.memberName]      — Name of the member who left
 * @param {string}          [opts.userId]          — Facebook UID of that member
 * @param {string}          [opts.groupName]       — Name of the group
 * @param {string}          [opts.leftBy]          — Who removed/left the member
 * @param {Date|string}     [opts.leftOn]          — When they left
 * @param {string|number}   [opts.totalMembers]    — Current member count
 * @param {string}          [opts.memberAvatarUrl] — Member profile picture URL
 * @param {string}          [opts.groupAvatarUrl]  — Group cover picture URL
 * @param {number}          [opts.width]           — Canvas width  (default 1920)
 * @param {number}          [opts.height]          — Canvas height (default 1080)
 * @returns {Promise<Buffer>}  PNG image buffer
 */
async function generateGoodbyeCard(opts = {}) {
  ensureFonts();

  // ── resolve parameters ───────────────────────────────────────────────────
  const memberName   = String(opts.memberName   || opts.name        || 'Unknown Member');
  const userId       = String(opts.userId       || opts.uid         || '000000000000000');
  const groupName    = String(opts.groupName    || opts.group       || 'Unknown Group');
  const leftBy       = String(opts.leftBy       || opts.removedBy   || memberName);
  const leftOn       = formatDate(opts.leftOn   || opts.date        || opts.leftAt || new Date());
  const totalMembers = String(opts.totalMembers || opts.memberCount || '0');
  const memberAvatarUrl = opts.memberAvatarUrl || opts.avatarUrl   || opts.avatar       || null;
  const groupAvatarUrl  = opts.groupAvatarUrl  || opts.groupAvatar || opts.groupIcon    || null;

  const W = opts.width  || 1920;
  const H = opts.height || 1080;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = 'high';

  // ── COLOUR CONSTANTS (blue theme) ────────────────────────────────────────
  const C = {
    bg0:        '#050c1a',
    bg1:        '#0a1428',
    bg2:        '#0e1e3d',
    navy:       '#0a0e1a',
    royal:      '#1a3fb5',
    royalLight: '#2563eb',
    sky:        '#4db8ff',
    skyDim:     '#1e5fa8',
    skyGlow:    'rgba(77,184,255,0.65)',
    skyFaint:   'rgba(77,184,255,0.12)',
    white:      '#ffffff',
    dim:        'rgba(255,255,255,0.08)',
    dimMid:     'rgba(255,255,255,0.15)',
    dimStrong:  'rgba(255,255,255,0.55)',
    panelBg0:   'rgba(8,18,45,0.90)',
    panelBg1:   'rgba(4,10,28,0.95)',
  };

  // ════════════════════════════════════════════════════════════════════════
  // 1. BACKGROUND
  // ════════════════════════════════════════════════════════════════════════
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#050c1a');
  bg.addColorStop(0.40, '#081528');
  bg.addColorStop(0.75, '#0a1930');
  bg.addColorStop(1,    '#030810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── corner glow waves ────────────────────────────────────────────────────
  // Top-left blue wave
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.28, 0);
  ctx.bezierCurveTo(W * 0.23, H * 0.16, W * 0.14, H * 0.26, 0, H * 0.30);
  ctx.closePath();
  const wTL = ctx.createLinearGradient(0, 0, W * 0.25, H * 0.25);
  wTL.addColorStop(0, 'rgba(20,80,200,0.65)');
  wTL.addColorStop(1, 'rgba(5,20,80,0.05)');
  ctx.fillStyle   = wTL;
  ctx.fill();
  ctx.strokeStyle = C.royalLight;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = C.sky;
  ctx.shadowBlur  = 18;
  ctx.stroke();
  ctx.restore();

  // Top-right blue wave
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W * 0.68, 0);
  ctx.bezierCurveTo(W * 0.74, H * 0.12, W * 0.85, H * 0.22, W, H * 0.25);
  ctx.closePath();
  const wTR = ctx.createLinearGradient(W, 0, W * 0.72, H * 0.22);
  wTR.addColorStop(0, 'rgba(30,100,220,0.60)');
  wTR.addColorStop(1, 'rgba(5,20,70,0.05)');
  ctx.fillStyle   = wTR;
  ctx.fill();
  ctx.strokeStyle = C.sky;
  ctx.lineWidth   = 2;
  ctx.shadowColor = C.sky;
  ctx.shadowBlur  = 14;
  ctx.stroke();
  ctx.restore();

  // Bottom-left
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.65);
  ctx.bezierCurveTo(W * 0.12, H * 0.72, W * 0.20, H * 0.85, W * 0.24, H);
  ctx.closePath();
  const wBL = ctx.createLinearGradient(0, H, W * 0.20, H * 0.70);
  wBL.addColorStop(0, 'rgba(15,70,185,0.70)');
  wBL.addColorStop(1, 'rgba(5,18,65,0.05)');
  ctx.fillStyle   = wBL;
  ctx.fill();
  ctx.strokeStyle = C.royalLight;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = C.sky;
  ctx.shadowBlur  = 16;
  ctx.stroke();
  ctx.restore();

  // Bottom-right
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W, H);
  ctx.lineTo(W * 0.62, H);
  ctx.bezierCurveTo(W * 0.74, H * 0.82, W * 0.88, H * 0.72, W, H * 0.66);
  ctx.closePath();
  const wBR = ctx.createLinearGradient(W, H, W * 0.70, H * 0.72);
  wBR.addColorStop(0, 'rgba(25,90,210,0.72)');
  wBR.addColorStop(0.5, 'rgba(12,50,140,0.45)');
  wBR.addColorStop(1, 'rgba(4,14,55,0.05)');
  ctx.fillStyle   = wBR;
  ctx.fill();
  ctx.strokeStyle = C.sky;
  ctx.lineWidth   = 3;
  ctx.shadowColor = C.sky;
  ctx.shadowBlur  = 22;
  ctx.stroke();
  ctx.restore();

  // ════════════════════════════════════════════════════════════════════════
  // 2. BACKGROUND DECORATIONS
  // ════════════════════════════════════════════════════════════════════════

  // Top-right diagonal stripes
  drawDiagonalStripes(ctx, W * 0.78, H * 0.18, 6, 18, 70, 'rgba(77,184,255,0.30)');

  // Bottom-right diagonal stripes
  drawDiagonalStripes(ctx, W * 0.85, H * 0.88, 5, 18, 60, 'rgba(77,184,255,0.25)');

  // Dot grids
  drawDotGrid(ctx, W * 0.05, H * 0.08,  4, 4, 14, 2.5, 'rgba(77,184,255,0.30)');
  drawDotGrid(ctx, W * 0.91, H * 0.08,  4, 4, 14, 2.5, 'rgba(77,184,255,0.28)');
  drawDotGrid(ctx, W * 0.48, H * 0.88,  5, 2, 16, 2.5, 'rgba(77,184,255,0.22)');

  // Plus / cross marks
  drawCross(ctx, W * 0.04,  H * 0.45, 16, 3.5, 'rgba(77,184,255,0.35)');
  drawCross(ctx, W * 0.96,  H * 0.45, 14, 3,   'rgba(77,184,255,0.30)');
  drawCross(ctx, W * 0.52,  H * 0.06, 12, 2.5, 'rgba(77,184,255,0.28)');
  drawCross(ctx, W * 0.38,  H * 0.94, 10, 2.5, 'rgba(77,184,255,0.25)');
  drawCross(ctx, W * 0.75,  H * 0.90, 12, 2.5, 'rgba(77,184,255,0.28)');

  // Hollow rings
  ctx.save();
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(26,63,181,0.45)';
  ctx.shadowColor = C.sky; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(W * 0.285, H * 0.18, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W * 0.86,  H * 0.18, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(W * 0.955, H * 0.55, 32, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W * 0.04,  H * 0.80, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Corner bracket curves (top-left, top-right, bottom-left, bottom-right)
  const bLen = 55, bOff = 28, bLW = 3;
  ctx.save();
  ctx.strokeStyle = 'rgba(77,184,255,0.38)';
  ctx.lineWidth   = bLW;
  ctx.lineCap     = 'round';
  ctx.shadowColor = C.sky; ctx.shadowBlur = 8;
  // TL
  ctx.beginPath(); ctx.moveTo(bOff, bOff + bLen); ctx.lineTo(bOff, bOff); ctx.lineTo(bOff + bLen, bOff); ctx.stroke();
  // TR
  ctx.beginPath(); ctx.moveTo(W - bOff - bLen, bOff); ctx.lineTo(W - bOff, bOff); ctx.lineTo(W - bOff, bOff + bLen); ctx.stroke();
  // BL
  ctx.beginPath(); ctx.moveTo(bOff, H - bOff - bLen); ctx.lineTo(bOff, H - bOff); ctx.lineTo(bOff + bLen, H - bOff); ctx.stroke();
  // BR
  ctx.beginPath(); ctx.moveTo(W - bOff - bLen, H - bOff); ctx.lineTo(W - bOff, H - bOff); ctx.lineTo(W - bOff, H - bOff - bLen); ctx.stroke();
  ctx.restore();

  // Paper plane (top-right decorative)
  drawPaperPlane(ctx, W * 0.755, H * 0.04, 38, C.sky);

  // Small dashed circle (center-top decoration)
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(77,184,255,0.25)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.arc(W * 0.505, H * 0.12, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ════════════════════════════════════════════════════════════════════════
  // 3. LEFT COLUMN — member circle + group circle
  // ════════════════════════════════════════════════════════════════════════

  // ── Left panel rounded rect background ──────────────────────────────────
  const LP_X = 28, LP_Y = 55, LP_W = 330, LP_H = H - 110;
  ctx.save();
  drawRoundedRect(ctx, LP_X, LP_Y, LP_W, LP_H, 22);
  const lpGrad = ctx.createLinearGradient(LP_X, LP_Y, LP_X, LP_Y + LP_H);
  lpGrad.addColorStop(0, 'rgba(8,22,55,0.75)');
  lpGrad.addColorStop(1, 'rgba(4,10,30,0.85)');
  ctx.fillStyle   = lpGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(37,99,235,0.55)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();

  // ── MEMBER AVATAR ────────────────────────────────────────────────────────
  const mCX = LP_X + LP_W / 2;
  const mCY = LP_Y + 175;
  const mR  = 105;

  // Outer glow rings
  ctx.save();
  ctx.strokeStyle = 'rgba(37,99,235,0.30)';
  ctx.lineWidth   = 14;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(mCX, mCY, mR + 22, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = C.royalLight;
  ctx.lineWidth   = 3;
  ctx.beginPath(); ctx.arc(mCX, mCY, mR + 10, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // Avatar clip & draw
  ctx.save();
  ctx.beginPath(); ctx.arc(mCX, mCY, mR, 0, Math.PI * 2); ctx.clip();
  let memberAvatarImg = null;
  try { memberAvatarImg = await loadAvatarImage(memberAvatarUrl); } catch (_) {}
  if (memberAvatarImg) {
    ctx.drawImage(memberAvatarImg, mCX - mR, mCY - mR, mR * 2, mR * 2);
  } else {
    drawDefaultAvatar(ctx, mCX, mCY, mR);
  }
  ctx.restore();

  // Avatar border stroke
  ctx.save();
  ctx.beginPath(); ctx.arc(mCX, mCY, mR, 0, Math.PI * 2);
  ctx.strokeStyle = C.sky; ctx.lineWidth = 4;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  // Crosshair ticks
  ctx.save();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(a => {
    const x1 = mCX + Math.cos(a) * (mR + 8),  y1 = mCY + Math.sin(a) * (mR + 8);
    const x2 = mCX + Math.cos(a) * (mR + 24), y2 = mCY + Math.sin(a) * (mR + 24);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.restore();

  // "MEMBER LEFT" badge
  const mbY = mCY + mR + 30;
  const mbW = 200, mbH = 40, mbX = mCX - mbW / 2;
  ctx.save();
  drawRoundedRect(ctx, mbX, mbY, mbW, mbH, 20);
  const mbGrad = ctx.createLinearGradient(mbX, mbY, mbX + mbW, mbY);
  mbGrad.addColorStop(0, '#1a3fb5');
  mbGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle   = mbGrad;
  ctx.fill();
  ctx.strokeStyle = C.sky; ctx.lineWidth = 1.5;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  // Badge icon (person) + text
  ctx.save();
  drawRowIcon(ctx, 'person', mbX + 14, mbY + 4, 32);
  ctx.fillStyle   = '#ffffff';
  ctx.font        = `bold 17px ${FONT}`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MEMBER LEFT', mCX + 10, mbY + mbH / 2);
  ctx.restore();

  // Member name
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = C.sky; ctx.shadowBlur = 12;
  // Clamp long names
  const mNameFontSize = memberName.length > 18 ? 26 : memberName.length > 14 ? 30 : 35;
  ctx.font      = `bold ${mNameFontSize}px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(memberName, mCX, mbY + 52, LP_W - 20);
  ctx.restore();

  // Broken heart decoration
  const bhY = mbY + 52 + mNameFontSize + 16;
  drawHeart(ctx, mCX - 14, bhY, 20, '#2563eb');
  drawHeart(ctx, mCX + 4,  bhY, 20, '#2563eb');
  // Crack line
  ctx.save();
  ctx.strokeStyle = '#050c1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mCX - 2, bhY + 4); ctx.lineTo(mCX - 2, bhY + 20); ctx.stroke();
  ctx.restore();

  // Divider dots
  const divY1 = bhY + 44;
  ctx.save();
  ctx.fillStyle = 'rgba(77,184,255,0.35)';
  for (let i = 0; i < 5; i++) {
    const dx = mCX - 32 + i * 16;
    ctx.beginPath(); ctx.arc(dx, divY1, i === 2 ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ── GROUP AVATAR ─────────────────────────────────────────────────────────
  const gCY = divY1 + 115;
  const gCX = mCX;
  const gR  = 90;

  ctx.save();
  ctx.strokeStyle = 'rgba(37,99,235,0.28)'; ctx.lineWidth = 12;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(gCX, gCY, gR + 18, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = C.royalLight; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(gCX, gCY, gR + 8,  0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.arc(gCX, gCY, gR, 0, Math.PI * 2); ctx.clip();
  let groupAvatarImg = null;
  try { groupAvatarImg = await loadAvatarImage(groupAvatarUrl); } catch (_) {}
  if (groupAvatarImg) {
    ctx.drawImage(groupAvatarImg, gCX - gR, gCY - gR, gR * 2, gR * 2);
  } else {
    drawDefaultAvatar(ctx, gCX, gCY, gR);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.arc(gCX, gCY, gR, 0, Math.PI * 2);
  ctx.strokeStyle = C.sky; ctx.lineWidth = 3.5;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();

  // "GROUP" badge
  const gbY = gCY + gR + 24;
  const gbW = 170, gbH = 38, gbX = gCX - gbW / 2;
  ctx.save();
  drawRoundedRect(ctx, gbX, gbY, gbW, gbH, 19);
  const gbGrad = ctx.createLinearGradient(gbX, gbY, gbX + gbW, gbY);
  gbGrad.addColorStop(0, '#1a3fb5');
  gbGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle   = gbGrad;
  ctx.fill();
  ctx.strokeStyle = C.sky; ctx.lineWidth = 1.5;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  drawRowIcon(ctx, 'group', gbX + 12, gbY + 3, 32);
  ctx.fillStyle   = '#ffffff';
  ctx.font        = `bold 16px ${FONT}`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GROUP', gCX + 10, gbY + gbH / 2);
  ctx.restore();

  // Group name
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = C.sky; ctx.shadowBlur = 10;
  const gNameFontSize = groupName.length > 20 ? 22 : groupName.length > 15 ? 26 : 30;
  ctx.font      = `bold ${gNameFontSize}px ${FONT_BOLD}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(groupName, gCX, gbY + 50, LP_W - 20);
  ctx.restore();

  // Blue dot-line accent at bottom of left panel
  const accY = LP_Y + LP_H - 38;
  ctx.save();
  ctx.strokeStyle = 'rgba(37,99,235,0.55)'; ctx.lineWidth = 1.5;
  const accLX = LP_X + 35, accRX = LP_X + LP_W - 35;
  ctx.beginPath(); ctx.moveTo(accLX, accY); ctx.lineTo(accRX, accY); ctx.stroke();
  drawHeart(ctx, mCX - 8, accY - 11, 16, C.royalLight);
  ctx.restore();

  // ════════════════════════════════════════════════════════════════════════
  // 4. CENTER COLUMN — GOOD BYE! title + WE WILL MISS YOU + quote
  // ════════════════════════════════════════════════════════════════════════

  const CC_LEFT  = LP_X + LP_W + 28;
  const CC_RIGHT = W * 0.545;
  const CC_CX    = (CC_LEFT + CC_RIGHT) / 2;

  // "GOOD" — white bold
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font         = `900 ${Math.round(H * 0.185)}px ${FONT_BOLD}`;
  // White glow
  ctx.shadowColor  = 'rgba(255,255,255,0.30)';
  ctx.shadowBlur   = 18;
  ctx.fillStyle    = '#ffffff';
  ctx.fillText('GOOD', CC_CX, LP_Y + 195);
  ctx.restore();

  // "BYE!" — blue gradient bold
  ctx.save();
  const byeFS = Math.round(H * 0.185);
  const byeGrad = ctx.createLinearGradient(CC_CX - 200, 0, CC_CX + 200, 0);
  byeGrad.addColorStop(0,   '#2563eb');
  byeGrad.addColorStop(0.5, '#4db8ff');
  byeGrad.addColorStop(1,   '#2563eb');
  ctx.fillStyle    = byeGrad;
  ctx.shadowColor  = C.sky; ctx.shadowBlur = 28;
  ctx.font         = `900 ${byeFS}px ${FONT_BOLD}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('BYE!', CC_CX, LP_Y + 195 + byeFS - 10);
  ctx.restore();

  // "WE WILL MISS YOU" ribbon
  const ribbonY   = LP_Y + 195 + byeFS + 22;
  const ribbonW   = 340, ribbonH = 50;
  const ribbonX   = CC_CX - ribbonW / 2;

  ctx.save();
  // Ribbon glow
  ctx.shadowColor = C.sky; ctx.shadowBlur = 22;
  // Folded tails
  ctx.fillStyle = '#0e2a70';
  ctx.beginPath();
  ctx.moveTo(ribbonX - 14, ribbonY - 14);
  ctx.lineTo(ribbonX + 14, ribbonY - 22);
  ctx.lineTo(ribbonX + 14, ribbonY + 22);
  ctx.lineTo(ribbonX - 14, ribbonY + 14);
  ctx.lineTo(ribbonX - 4, ribbonY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ribbonX + ribbonW + 14, ribbonY - 14);
  ctx.lineTo(ribbonX + ribbonW - 14, ribbonY - 22);
  ctx.lineTo(ribbonX + ribbonW - 14, ribbonY + 22);
  ctx.lineTo(ribbonX + ribbonW + 14, ribbonY + 14);
  ctx.lineTo(ribbonX + ribbonW + 4, ribbonY);
  ctx.closePath(); ctx.fill();
  // Main body
  drawRoundedRect(ctx, ribbonX, ribbonY - ribbonH / 2, ribbonW, ribbonH, 14);
  const rbGrad = ctx.createLinearGradient(ribbonX, 0, ribbonX + ribbonW, 0);
  rbGrad.addColorStop(0,   '#1a3fb5');
  rbGrad.addColorStop(0.5, '#2563eb');
  rbGrad.addColorStop(1,   '#1a3fb5');
  ctx.fillStyle   = rbGrad;
  ctx.fill();
  ctx.strokeStyle = C.sky; ctx.lineWidth = 2;
  ctx.stroke();
  // Hearts + text
  drawHeart(ctx, ribbonX + 24, ribbonY - 9, 16, '#ffffff');
  drawHeart(ctx, ribbonX + ribbonW - 32, ribbonY - 9, 16, '#ffffff');
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `bold 20px ${FONT_BOLD}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
  ctx.fillText('WE WILL MISS YOU', CC_CX, ribbonY);
  ctx.restore();

  // Quote box
  const qBoxX = CC_LEFT + 8, qBoxY = ribbonY + 52;
  const qBoxW  = CC_RIGHT - CC_LEFT - 16;
  const qBoxH  = H - qBoxY - 130;
  ctx.save();
  drawRoundedRect(ctx, qBoxX, qBoxY, qBoxW, qBoxH, 18);
  const qbGrad = ctx.createLinearGradient(qBoxX, qBoxY, qBoxX, qBoxY + qBoxH);
  qbGrad.addColorStop(0, 'rgba(8,20,55,0.75)');
  qbGrad.addColorStop(1, 'rgba(5,12,35,0.85)');
  ctx.fillStyle   = qbGrad; ctx.fill();
  ctx.strokeStyle = 'rgba(37,99,235,0.45)'; ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Big quote marks
  ctx.save();
  ctx.font         = `bold 72px ${FONT_BOLD}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(37,99,235,0.50)';
  ctx.fillText('\u201C', qBoxX + 18, qBoxY + 6);
  ctx.textAlign    = 'right';
  ctx.fillText('\u201D', qBoxX + qBoxW - 18, qBoxY + qBoxH - 56);
  ctx.restore();

  // Quote text — wrap
  const quoteText = 'Thank you for being a part of our journey. Your presence and memories will always be with us.';
  ctx.save();
  ctx.fillStyle    = 'rgba(220,235,255,0.90)';
  ctx.font         = `normal ${Math.round(H * 0.028)}px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,30,0.6)'; ctx.shadowBlur = 6;
  // Simple word-wrap
  const qFontSize  = Math.round(H * 0.028);
  const qLineH     = qFontSize * 1.55;
  const qMaxW      = qBoxW - 80;
  const qWords     = quoteText.split(' ');
  const qLines     = [];
  let cur = '';
  for (const w of qWords) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > qMaxW && cur) { qLines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) qLines.push(cur);
  const qTotalH = qLines.length * qLineH;
  const qStartY = qBoxY + qBoxH / 2 - qTotalH / 2 + 4;
  qLines.forEach((line, i) => {
    ctx.fillText(line, CC_CX, qStartY + i * qLineH);
  });
  ctx.restore();

  // ════════════════════════════════════════════════════════════════════════
  // 5. RIGHT COLUMN — info panel
  // ════════════════════════════════════════════════════════════════════════

  const IP_X = CC_RIGHT + 18;
  const IP_Y = LP_Y;
  const IP_W = W - IP_X - 28;
  const IP_H = LP_H;
  const IP_R = 22;

  ctx.save();
  drawRoundedRect(ctx, IP_X, IP_Y, IP_W, IP_H, IP_R);
  const ipGrad = ctx.createLinearGradient(IP_X, IP_Y, IP_X, IP_Y + IP_H);
  ipGrad.addColorStop(0, 'rgba(8,20,55,0.88)');
  ipGrad.addColorStop(1, 'rgba(4,10,32,0.94)');
  ctx.fillStyle   = ipGrad; ctx.fill();
  // Double stroke glow
  ctx.strokeStyle = C.royalLight; ctx.lineWidth = 3;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(77,184,255,0.25)'; ctx.lineWidth = 1;
  ctx.shadowBlur  = 0;
  ctx.stroke();
  ctx.restore();

  // Info rows
  const rows = [
    { icon: 'person',   label: 'Name',          value: memberName     },
    { icon: 'id',       label: 'User ID',        value: userId         },
    { icon: 'group',    label: 'Group',          value: groupName      },
    { icon: 'leftBy',   label: 'Left By',        value: leftBy         },
    { icon: 'calendar', label: 'Left On',        value: leftOn         },
    { icon: 'members',  label: 'Total Members',  value: totalMembers   },
  ];

  const rowH   = IP_H / rows.length;
  const iPad   = 26;
  const iBoxSz = 44;

  rows.forEach((row, idx) => {
    const rowY  = IP_Y + idx * rowH;
    const rowCY = rowY + rowH / 2;

    // Row separator
    if (idx > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(IP_X + iPad,         rowY);
      ctx.lineTo(IP_X + IP_W - iPad,  rowY);
      ctx.stroke();
      ctx.restore();
    }

    // Icon box
    const iBoxX = IP_X + iPad;
    const iBoxY = rowCY - iBoxSz / 2;
    ctx.save();
    drawRoundedRect(ctx, iBoxX, iBoxY, iBoxSz, iBoxSz, 10);
    const ibGrad = ctx.createLinearGradient(iBoxX, iBoxY, iBoxX, iBoxY + iBoxSz);
    ibGrad.addColorStop(0, '#1a3fb5');
    ibGrad.addColorStop(1, '#0e2470');
    ctx.fillStyle   = ibGrad; ctx.fill();
    ctx.strokeStyle = 'rgba(77,184,255,0.45)'; ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    drawRowIcon(ctx, row.icon, iBoxX + 3, iBoxY + 3, iBoxSz - 6);

    // Label
    const labelX = iBoxX + iBoxSz + 16;
    ctx.save();
    ctx.fillStyle    = 'rgba(160,195,255,0.85)';
    ctx.font         = `normal ${Math.round(H * 0.024)}px ${FONT}`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, labelX, rowCY);
    ctx.restore();

    // Vertical divider
    const divX = iBoxX + iBoxSz + 145;
    ctx.save();
    ctx.strokeStyle = 'rgba(77,184,255,0.30)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(divX, rowCY - rowH * 0.3);
    ctx.lineTo(divX, rowCY + rowH * 0.3);
    ctx.stroke();
    ctx.restore();

    // Value
    const valX = divX + 18;
    const maxValW = IP_X + IP_W - iPad - valX;
    ctx.save();
    ctx.fillStyle    = '#ffffff';
    const vFontSz = Math.round(H * 0.026);
    ctx.font         = `bold ${vFontSz}px ${FONT_BOLD}`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(77,184,255,0.30)'; ctx.shadowBlur = 8;
    // Truncate if too long
    let val = row.value;
    while (ctx.measureText(val).width > maxValW && val.length > 4) {
      val = val.slice(0, -1);
    }
    if (val !== row.value) val = val.slice(0, -1) + '…';
    ctx.fillText(val, valX, rowCY);
    ctx.restore();
  });

  // ════════════════════════════════════════════════════════════════════════
  // 6. BOTTOM BANNER — THANKS FOR BEING WITH US
  // ════════════════════════════════════════════════════════════════════════

  const bnW = 600, bnH = 58;
  const bnX = W / 2 - bnW / 2;
  const bnY = H - 88;

  ctx.save();
  drawRoundedRect(ctx, bnX, bnY, bnW, bnH, 29);
  const bnGrad = ctx.createLinearGradient(bnX, bnY, bnX + bnW, bnY);
  bnGrad.addColorStop(0,    '#1030a0');
  bnGrad.addColorStop(0.35, '#2563eb');
  bnGrad.addColorStop(0.65, '#2563eb');
  bnGrad.addColorStop(1,    '#1030a0');
  ctx.fillStyle   = bnGrad; ctx.fill();
  ctx.strokeStyle = C.sky; ctx.lineWidth = 2;
  ctx.shadowColor = C.sky; ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();

  // Banner dots + hearts decoration
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(bnX + 28, bnY + bnH / 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bnX + 44, bnY + bnH / 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bnX + 57, bnY + bnH / 2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bnX + bnW - 28, bnY + bnH / 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bnX + bnW - 44, bnY + bnH / 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bnX + bnW - 57, bnY + bnH / 2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawHeart(ctx, W / 2 - 185, bnY + bnH / 2 - 10, 18, '#ffffff');
  drawHeart(ctx, W / 2 + 173, bnY + bnH / 2 - 10, 18, '#ffffff');

  ctx.save();
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `bold ${Math.round(H * 0.030)}px ${FONT_BOLD}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,30,0.5)'; ctx.shadowBlur = 8;
  ctx.fillText('THANKS FOR BEING WITH US!', W / 2, bnY + bnH / 2);
  ctx.restore();

  // "MADE BY RIYAD"
  ctx.save();
  ctx.fillStyle    = 'rgba(160,195,255,0.70)';
  ctx.font         = `bold ${Math.round(H * 0.018)}px ${FONT}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '3px';
  ctx.fillText('MADE BY RIYAD', W / 2, bnY + bnH + 10);
  ctx.restore();

  // Underline below "MADE BY RIYAD"
  ctx.save();
  ctx.strokeStyle = 'rgba(77,184,255,0.40)'; ctx.lineWidth = 1.2;
  const ulW = 160;
  ctx.beginPath();
  ctx.moveTo(W / 2 - ulW / 2, bnY + bnH + 32);
  ctx.lineTo(W / 2 + ulW / 2, bnY + bnH + 32);
  ctx.stroke();
  ctx.restore();

  // ════════════════════════════════════════════════════════════════════════
  // 7. RETURN BUFFER
  // ════════════════════════════════════════════════════════════════════════

  if (typeof canvas.toBuffer === 'function') {
    return canvas.toBuffer('image/png');
  }
  return canvas;
}

// CommonJS exports — mirrors welcomeCardGenerator.js
module.exports = generateGoodbyeCard;
module.exports.generateGoodbyeCard = generateGoodbyeCard;
module.exports.createGoodbyeCard   = generateGoodbyeCard;
module.exports.goodbyeCard         = generateGoodbyeCard;
