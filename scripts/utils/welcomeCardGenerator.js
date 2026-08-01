/**
 * welcomeCardGenerator.js
 * High-Quality Node.js Canvas Welcome Card Generator — RIYAD BOT
 *
 * Recreates the Canva "Welcome To Our Group" design (dark neon / glass
 * panels, teal member ring, purple "Group" row, amber "Added By" row,
 * gradient "MADE BY RIYAD" footer) using the extracted design assets in
 * ./cardAssets, with all copy drawn dynamically so it supports English,
 * Bangla (বাংলা) and mixed text, and auto-shrinks long names.
 *
 * Output: 1920x1080 PNG buffer.
 *
 * Public API (unchanged from the previous version so existing callers,
 * e.g. scripts/events/memberWelcome.js, keep working with no edits):
 *
 *   const { generateWelcomeCard } = require('./welcomeCardGenerator');
 *   const buffer = await generateWelcomeCard({
 *     memberName, groupName, addedBy, totalMembers,
 *     avatarUrl, avatarFallbackUrl,
 *     groupAvatarUrl, groupAvatarFallbackUrl,     // optional, new
 *     addedByAvatarUrl, addedByAvatarFallbackUrl, // optional, new
 *   });
 */

'use strict';

const path = require('path');
const fs = require('fs');

let axios = null;
try {
  axios = require('axios');
} catch (e) {
  // optional — we fall back to loadImage(url) directly if axios is missing
}

// ---------------------------------------------------------------------
// Canvas backend — prefer @napi-rs/canvas (faster, no native build step),
// fall back to "canvas" (already a dependency of this project).
// ---------------------------------------------------------------------
let createCanvas, loadImage, registerFont;
try {
  const napi = require('@napi-rs/canvas');
  createCanvas = napi.createCanvas;
  loadImage = napi.loadImage;
  registerFont = napi.GlobalFonts
    ? (fontPath, opts) => napi.GlobalFonts.registerFromPath(fontPath, opts && opts.family)
    : napi.registerFont;
} catch (e1) {
  try {
    const c = require('canvas');
    createCanvas = c.createCanvas;
    loadImage = c.loadImage;
    registerFont = c.registerFont;
  } catch (e2) {
    throw new Error(
      'No canvas implementation found. Please run "npm install canvas" (or "@napi-rs/canvas").'
    );
  }
}

// ---------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------
const FONTS_DIR = path.join(__dirname, 'fonts');
const ASSETS_DIR = path.join(__dirname, 'cardAssets');

let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const fontFiles = [
    { file: 'Montserrat-Black.ttf', family: 'Display', weight: '900' },
    { file: 'Montserrat-ExtraBold.ttf', family: 'Display', weight: '800' },
    { file: 'Poppins-Bold.ttf', family: 'Poppins', weight: 'bold' },
    { file: 'Poppins-SemiBold.ttf', family: 'Poppins', weight: '600' },
    { file: 'Poppins-Regular.ttf', family: 'Poppins', weight: 'normal' },
    { file: 'BebasNeue-Regular.ttf', family: 'Bebas Neue', weight: 'normal' },
    { file: 'HindSiliguri-Bold.ttf', family: 'Hind Siliguri', weight: 'bold' },
    { file: 'HindSiliguri-Regular.ttf', family: 'Hind Siliguri', weight: 'normal' },
    { file: 'NotoSansBengali-Bold.ttf', family: 'Noto Sans Bengali', weight: 'bold' },
    { file: 'NotoSansBengali-Regular.ttf', family: 'Noto Sans Bengali', weight: 'normal' },
  ];

  for (const f of fontFiles) {
    try {
      const fullPath = path.join(FONTS_DIR, f.file);
      if (fs.existsSync(fullPath) && typeof registerFont === 'function') {
        registerFont(fullPath, { family: f.family, weight: f.weight });
      }
    } catch (err) {
      console.error('[welcomeCardGenerator] Font registration failed for', f.file, err && err.message);
    }
  }
}

// Display font = big headline/gradient text (WELCOME, RIYAD, names).
// Label font = small letter-spaced caps (NEW MEMBER, GROUP, ADDED BY, MADE BY).
// Body font = value text fallback for Latin script.
// Bangla font = used automatically whenever Bangla characters are detected.
const F_DISPLAY = '"Display", "Arial Black", "Impact", sans-serif';
const F_LABEL = '"Bebas Neue", "Arial Narrow", sans-serif';
const F_BODY = '"Poppins", "Trebuchet MS", "Segoe UI", sans-serif';
const F_BANGLA = '"Hind Siliguri", "Noto Sans Bengali", sans-serif';

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/** True if the string contains Bangla (Unicode block U+0980–U+09FF). */
function hasBangla(str) {
  return /[\u0980-\u09FF]/.test(str || '');
}

/**
 * Strips invisible / zero-advance-but-not-zero-width "filler" characters
 * that some Facebook display names contain (used as a name-styling trick).
 * The worst offenders are the Hangul filler jamo (U+115F, U+1160, U+3164,
 * U+FFA0) — these render as *nothing* in most fonts but still reserve a
 * full glyph cell, so a name padded with them measures much wider than it
 * looks and blows a huge blank gap into the row. Also strips genuinely
 * zero-width characters (ZWSP/ZWNJ/ZWJ/word-joiner/BOM, soft hyphen,
 * Mongolian vowel separator) and collapses any leftover run of whitespace
 * so trimming still behaves as expected.
 */
const INVISIBLE_CHARS_RE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD\u180E\u115F\u1160\u3164\uFFA0]/g;
function sanitizeDisplayText(str) {
  if (!str) return str;
  return String(str)
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Splits text into runs of consecutive Bangla / non-Bangla characters so a
 * single line can mix "English নাম Bangla" and have each run rendered with
 * the correct font.
 */
function splitScriptRuns(text) {
  const runs = [];
  if (!text) return runs;
  let current = '';
  let currentIsBangla = null;
  for (const ch of String(text)) {
    const isBangla = /[\u0980-\u09FF]/.test(ch);
    if (currentIsBangla === null) {
      currentIsBangla = isBangla;
      current = ch;
    } else if (isBangla === currentIsBangla) {
      current += ch;
    } else {
      runs.push({ text: current, bangla: currentIsBangla });
      current = ch;
      currentIsBangla = isBangla;
    }
  }
  if (current) runs.push({ text: current, bangla: currentIsBangla });
  return runs;
}

/**
 * Builds the CSS-ish canvas font string for a given run, weight and size,
 * automatically choosing the Bangla font stack when needed.
 */
function fontFor(run, weight, size, family) {
  const stack = run.bangla ? F_BANGLA : (family || F_BODY);
  return `${weight} ${size}px ${stack}`;
}

/** Measures the total pixel width of mixed-script text at a given size. */
function measureMixed(ctx, text, weight, size, family) {
  const runs = splitScriptRuns(text);
  let total = 0;
  for (const run of runs) {
    ctx.font = fontFor(run, weight, size, family);
    total += ctx.measureText(run.text).width;
  }
  return total;
}

/**
 * Draws mixed Bangla/English text on one line, auto-shrinking the font size
 * (down to minSize) until it fits maxWidth. Supports 'left' or 'center'
 * alignment. Returns the font size actually used.
 */
function drawAutoFitText(ctx, text, x, y, opts) {
  const {
    maxSize = 40,
    minSize = 14,
    maxWidth = 600,
    weight = 'bold',
    family = F_BODY,
    align = 'left',
    color = '#ffffff',
    shadowColor = null,
    shadowBlur = 0,
    letterSpacing = 0,
  } = opts;

  let size = maxSize;
  let width = measureMixed(ctx, text, weight, size, family);
  while (width > maxWidth && size > minSize) {
    size -= 1;
    width = measureMixed(ctx, text, weight, size, family);
  }

  const runs = splitScriptRuns(text);
  // Recompute exact width including manual letter-spacing, since
  // ctx.measureText doesn't know about it.
  let totalWidth = 0;
  const runWidths = runs.map((run) => {
    ctx.font = fontFor(run, weight, size, family);
    let w = 0;
    for (const ch of run.text) w += ctx.measureText(ch).width + letterSpacing;
    w -= letterSpacing; // no trailing spacing after the very last glyph
    totalWidth += w;
    return w;
  });

  let cursorX = align === 'center' ? x - totalWidth / 2 : x;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (shadowColor) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
  }
  runs.forEach((run, i) => {
    ctx.font = fontFor(run, weight, size, family);
    if (letterSpacing) {
      for (const ch of run.text) {
        ctx.fillText(ch, cursorX, y);
        cursorX += ctx.measureText(ch).width + letterSpacing;
      }
    } else {
      ctx.fillText(run.text, cursorX, y);
      cursorX += runWidths[i];
    }
  });
  ctx.restore();

  return size;
}

/** Rounded rectangle path helper. */
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draws a simple 4-point sparkle/star, used next to "NEW MEMBER" / "RIYAD". */
function drawSparkle(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx + size * 0.15, cy - size * 0.15, cx + size, cy);
  ctx.quadraticCurveTo(cx + size * 0.15, cy + size * 0.15, cx, cy + size);
  ctx.quadraticCurveTo(cx - size * 0.15, cy + size * 0.15, cx - size, cy);
  ctx.quadraticCurveTo(cx - size * 0.15, cy - size * 0.15, cx, cy - size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Generic silhouette placeholder, drawn when an avatar can't be loaded. */
function drawPlaceholderAvatar(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2b2b38';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#484858';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 1.15, r * 0.75, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Loads an image from a remote URL (via axios if available) or local path. */
async function safeLoadImage(source) {
  if (!source) return null;
  try {
    if (/^https?:\/\//i.test(source) && axios) {
      const res = await axios.get(source, { responseType: 'arraybuffer', timeout: 15000 });
      return await loadImage(Buffer.from(res.data));
    }
    return await loadImage(source);
  } catch (err) {
    return null;
  }
}

/** Tries the primary URL, then the fallback URL, then null. */
async function loadAvatar(primary, fallback) {
  let img = await safeLoadImage(primary);
  if (!img && fallback) img = await safeLoadImage(fallback);
  return img;
}

/** Draws an avatar image (or placeholder) cover-fit and clipped to a circle. */
function drawCircleAvatar(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.restore();
    drawPlaceholderAvatar(ctx, cx, cy, r);
    return;
  }
  ctx.restore();
}

/** Loads a local asset PNG, returning null (not throwing) if it's missing. */
async function loadAsset(relPath) {
  const full = path.join(ASSETS_DIR, relPath);
  try {
    if (!fs.existsSync(full)) return null;
    return await loadImage(full);
  } catch (err) {
    console.error('[welcomeCardGenerator] Failed to load asset', relPath, err && err.message);
    return null;
  }
}

/** Draws an image into a bounding box (non-uniform "stretch to fit"). */
function drawImageFit(ctx, img, x, y, w, h) {
  if (!img) return;
  ctx.drawImage(img, x, y, w, h);
}

/**
 * Returns an amber-tinted copy of a (mostly-white/monochrome-ring) source
 * image, drawn onto an offscreen canvas with `source-atop` compositing.
 * Used to recolor the fixed member-ring asset (see `punchRingHole`) into
 * the purple/amber rings used by the "Group" and "Added By" rows, since
 * only one ring shape was exported from the Canva SVG (see CHANGES.md).
 */
function tintImage(img, color) {
  if (!img) return null;
  const off = createCanvas(img.width, img.height);
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = color;
  octx.fillRect(0, 0, img.width, img.height);
  return off;
}

/**
 * `frames/frame_002.png` (the avatar ring/glow asset) was exported with an
 * opaque dark disc + glow baked into its own center — fine as a standalone
 * graphic, but fatal when drawn on top of an avatar, since it blots out
 * the whole face instead of just framing it. This clears that center out
 * with a `destination-out` radial mask, leaving only the glowing ring
 * itself, so the avatar underneath shows through. `innerRatio` is where
 * the erase is 100% (relative to the image's half-width/height); it fades
 * to 0% by `featherRatio` so the ring's own soft glow survives intact.
 */
function punchRingHole(img, innerRatio = 0.8, featherRatio = 0.92) {
  if (!img) return null;
  const off = createCanvas(img.width, img.height);
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  const cx = img.width / 2;
  const cy = img.height / 2;
  const maxR = Math.min(cx, cy);
  octx.globalCompositeOperation = 'destination-out';
  const grad = octx.createRadialGradient(cx, cy, 0, cx, cy, maxR * featherRatio);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(innerRatio / featherRatio, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = grad;
  octx.beginPath();
  octx.arc(cx, cy, maxR, 0, Math.PI * 2);
  octx.fill();
  octx.globalCompositeOperation = 'source-over';
  return off;
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------
// All coordinates below are defined in the Canva design's own coordinate
// space (1731 x 909 — the reference export render), then uniformly scaled
// up to fill the required 1920x1080 (16:9) output canvas without
// distorting circles/rings. This keeps every measurement traceable back
// to the reference image instead of being guessed directly in 1920-space.
const REF_W = 1731;
const REF_H = 909;
const CANVAS_W = 1920;
const CANVAS_H = 1080;
const SCALE = CANVAS_W / REF_W; // 1.10919...
const OFFSET_Y = (CANVAS_H - REF_H * SCALE) / 2; // vertical letterbox centering

const X = (v) => v * SCALE;
const Y = (v) => v * SCALE + OFFSET_Y;
const LEN = (v) => v * SCALE;

// ---------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {string} opts.memberName        Dynamic — new member's display name
 * @param {string} opts.groupName         Dynamic — group/thread name
 * @param {string} opts.addedBy           Dynamic — name of whoever added them
 * @param {number|string} [opts.totalMembers] Dynamic — total member count
 * @param {string} [opts.avatarUrl]              Member avatar URL
 * @param {string} [opts.avatarFallbackUrl]       Member avatar fallback URL
 * @param {string} [opts.groupAvatarUrl]          Group avatar URL
 * @param {string} [opts.groupAvatarFallbackUrl]  Group avatar fallback URL
 * @param {string} [opts.addedByAvatarUrl]        Added-by avatar URL
 * @param {string} [opts.addedByAvatarFallbackUrl] Added-by avatar fallback URL
 * @returns {Promise<Buffer>} PNG image buffer (1920x1080)
 */
async function generateWelcomeCard(opts = {}) {
  ensureFontsRegistered();

  const memberName = sanitizeDisplayText(opts.memberName) || 'New Member';
  const groupName = sanitizeDisplayText(opts.groupName) || 'Group Chat';
  const addedBy = sanitizeDisplayText(opts.addedBy) || 'Unknown';
  const totalMembers =
    opts.totalMembers === undefined || opts.totalMembers === null || opts.totalMembers === ''
      ? '—'
      : String(opts.totalMembers);

  // Kick off all network/asset loads in parallel.
  const [
    memberAvatarImg,
    groupAvatarImg,
    addedByAvatarImg,
    bgFull,
    bgLeft,
    ringRaw,
    panelOuter,
    panelCorner,
    panelGroupRow,
    panelAddedByRow,
    panelMadeByRow,
    dotGrid,
    sparkleAsset,
    dashLine,
    dotSeparator,
    iconGroup,
    iconAddedBy,
    iconMember,
  ] = await Promise.all([
    loadAvatar(opts.avatarUrl, opts.avatarFallbackUrl),
    loadAvatar(opts.groupAvatarUrl, opts.groupAvatarFallbackUrl),
    loadAvatar(opts.addedByAvatarUrl, opts.addedByAvatarFallbackUrl),
    loadAsset('backgrounds/background_001.png'),
    loadAsset('backgrounds/background_002.png'),
    loadAsset('frames/frame_002.png'),
    loadAsset('panels/panel_001.png'),
    loadAsset('panels/panel_004.png'),
    loadAsset('panels/panel_005.png'),
    loadAsset('panels/panel_007.png'),
    loadAsset('panels/panel_009.png'),
    loadAsset('decorations/decoration_001.png'),
    loadAsset('decorations/decoration_004.png'),
    loadAsset('decorations/decoration_003.png'),
    loadAsset('decorations/decoration_006.png'),
    loadAsset('icons/icon_003.png'),
    loadAsset('icons/icon_005.png'),
    loadAsset('icons/icon_008.png'),
  ]);

  // `frame_001.png` used to be (wrongly) pressed into service as the ring
  // for the Group/Added-By avatars — it's actually a sparse dot-grid
  // pattern, not a ring, which is why those avatars showed a dot-pattern
  // blob instead of a glowing circle. The only real ring asset is
  // frame_002.png, so every ring (member/group/added-by) is now derived
  // from one punched-open copy of it, tinted per row (see CHANGES.md).
  const ringBase = punchRingHole(ringRaw);
  const ringMember = ringBase;
  const ringGroup = tintImage(ringBase, '#a63bff');
  const ringAddedBy = tintImage(ringBase, '#f5a623');

  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.antialias = 'subpixel';

  // ---- 0. Base fill (also acts as the top/bottom letterbox color) -------
  ctx.fillStyle = '#050109';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ---- 1. Full-bleed background, then left navy section on top ---------
  if (bgFull) {
    drawImageFit(ctx, bgFull, X(0), Y(0), LEN(REF_W), LEN(REF_H));
  }
  if (bgLeft) {
    drawImageFit(ctx, bgLeft, X(0), Y(0), LEN(665), LEN(REF_H));
  }

  // =======================================================================
  // LEFT PANEL — member avatar, name, member count
  // =======================================================================
  const leftCenterX = 333;

  // "✦ NEW MEMBER ✦" ribbon label
  ctx.save();
  drawAutoFitText(ctx, 'N E W   M E M B E R', X(leftCenterX), Y(88), {
    maxSize: LEN(26),
    minSize: LEN(14),
    maxWidth: LEN(420),
    weight: 'normal',
    family: F_LABEL,
    align: 'center',
    color: '#4be9c0',
    shadowColor: '#2fffb0',
    shadowBlur: LEN(10),
  });
  ctx.strokeStyle = 'rgba(75, 233, 192, 0.85)';
  ctx.lineWidth = LEN(1.5);
  ctx.beginPath();
  ctx.moveTo(X(leftCenterX - 210), Y(88));
  ctx.lineTo(X(leftCenterX - 130), Y(88));
  ctx.moveTo(X(leftCenterX + 130), Y(88));
  ctx.lineTo(X(leftCenterX + 210), Y(88));
  ctx.stroke();
  if (sparkleAsset) {
    const s = LEN(26);
    ctx.drawImage(sparkleAsset, X(leftCenterX - 230) - s / 2, Y(88) - s / 2, s, s);
    ctx.drawImage(sparkleAsset, X(leftCenterX + 230) - s / 2, Y(88) - s / 2, s, s);
  } else {
    drawSparkle(ctx, X(leftCenterX - 230), Y(88), LEN(9), '#4be9c0');
    drawSparkle(ctx, X(leftCenterX + 230), Y(88), LEN(9), '#4be9c0');
  }
  ctx.restore();

  // Dotted grid corner decoration (top-left of left panel)
  if (dotGrid) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(dotGrid, X(85), Y(135), LEN(140), LEN(160));
    ctx.restore();
  }

  // Member avatar (teal glowing ring, per reference design)
  const avCX = leftCenterX;
  const avCY = 397;
  const avR = 218;
  drawCircleAvatar(ctx, memberAvatarImg, X(avCX), Y(avCY), LEN(avR * 0.95));
  if (ringMember) {
    const s = avR * 2 * 1.06;
    ctx.drawImage(ringMember, X(avCX) - LEN(s) / 2, Y(avCY) - LEN(s) / 2, LEN(s), LEN(s));
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(X(avCX), Y(avCY), LEN(avR), 0, Math.PI * 2);
    ctx.strokeStyle = '#4be9c0';
    ctx.lineWidth = LEN(6);
    ctx.shadowColor = '#2fffb0';
    ctx.shadowBlur = LEN(20);
    ctx.stroke();
    ctx.restore();
  }

  // Member name (auto-shrinks for long names, supports Bangla + English)
  drawAutoFitText(ctx, memberName, X(leftCenterX), Y(675), {
    maxSize: LEN(52),
    minSize: LEN(22),
    maxWidth: LEN(560),
    weight: '800',
    family: F_DISPLAY,
    align: 'center',
    color: '#ffffff',
    shadowColor: 'rgba(75, 233, 192, 0.55)',
    shadowBlur: LEN(14),
  });

  // Total member count pill
  const pillX = 92;
  const pillY = 738;
  const pillW = 470;
  const pillH = 96;
  ctx.save();
  roundedRectPath(ctx, X(pillX), Y(pillY), LEN(pillW), LEN(pillH), LEN(pillH / 2));
  ctx.strokeStyle = 'rgba(75, 233, 192, 0.85)';
  ctx.lineWidth = LEN(2.5);
  ctx.shadowColor = 'rgba(60, 230, 190, 0.5)';
  ctx.shadowBlur = LEN(12);
  ctx.stroke();
  ctx.restore();

  const pillIconCX = pillX + 55;
  const pillIconCY = pillY + pillH / 2;
  if (iconMember) {
    const iw = LEN(30);
    const ih = LEN(40);
    ctx.drawImage(iconMember, X(pillIconCX) - iw / 2, Y(pillIconCY) - ih / 2, iw, ih);
  } else {
    ctx.save();
    ctx.fillStyle = '#4be9c0';
    ctx.beginPath();
    ctx.arc(X(pillIconCX), Y(pillIconCY) - LEN(10), LEN(9), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(X(pillIconCX), Y(pillIconCY) + LEN(14), LEN(15), Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawAutoFitText(ctx, `${totalMembers}  Member`, X(pillX + 260), Y(pillY + pillH / 2), {
    maxSize: LEN(26),
    minSize: LEN(15),
    maxWidth: LEN(330),
    weight: 'bold',
    family: F_BODY,
    align: 'center',
    color: '#e9fff6',
  });
  if (sparkleAsset) {
    const s = LEN(20);
    ctx.drawImage(sparkleAsset, X(pillX + pillW - 30) - s / 2, Y(pillY + 18) - s / 2, s, s);
  }

  // Bottom decorative row: teal line + dashed dots + diagonal stripe accent
  ctx.save();
  ctx.strokeStyle = 'rgba(75, 233, 192, 0.7)';
  ctx.lineWidth = LEN(3);
  ctx.beginPath();
  ctx.moveTo(X(22), Y(878));
  ctx.lineTo(X(140), Y(878));
  ctx.stroke();
  if (dashLine) {
    ctx.drawImage(dashLine, X(160), Y(868), LEN(150), LEN(20));
  }
  ctx.strokeStyle = 'rgba(190, 90, 255, 0.8)';
  ctx.lineWidth = LEN(4);
  for (let i = 0; i < 4; i++) {
    const lx = 300 + i * 16;
    ctx.beginPath();
    ctx.moveTo(X(lx), Y(888));
    ctx.lineTo(X(lx + 9), Y(868));
    ctx.stroke();
  }
  ctx.restore();

  // =======================================================================
  // RIGHT PANEL — header, then Group / Added By / Made By Riyad rows
  // =======================================================================
  const rightContentX = 705;

  // Outer glass container behind the three rows
  if (panelOuter) {
    drawImageFit(ctx, panelOuter, X(690), Y(28), LEN(1010), LEN(858));
  }

  // Header corner dots
  ctx.save();
  ctx.fillStyle = 'rgba(150, 120, 255, 0.9)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(X(rightContentX + i * 30), Y(90), LEN(4.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Diagonal triple-line decoration, top right
  if (panelCorner) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(panelCorner, X(1550), Y(30), LEN(165), LEN(230));
    ctx.restore();
  }

  // "WELCOME"
  drawAutoFitText(ctx, 'WELCOME', X(rightContentX), Y(140), {
    maxSize: LEN(74),
    minSize: LEN(40),
    maxWidth: LEN(760),
    weight: '900',
    family: F_DISPLAY,
    align: 'left',
    color: '#ffffff',
  });

  // "TO OUR GROUP" — "TO OUR" white/blue, "GROUP" gradient
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${LEN(52)}px ${F_DISPLAY}`;
  ctx.fillStyle = '#bcd2ff';
  const toOurText = 'TO OUR ';
  ctx.fillText(toOurText, X(rightContentX), Y(210));
  const toOurWidth = ctx.measureText(toOurText).width;
  const grad = ctx.createLinearGradient(
    X(rightContentX) + toOurWidth,
    0,
    X(rightContentX) + toOurWidth + LEN(320),
    0
  );
  grad.addColorStop(0, '#7a5cff');
  grad.addColorStop(0.5, '#4c8bff');
  grad.addColorStop(1, '#38e0c6');
  ctx.fillStyle = grad;
  ctx.fillText('GROUP', X(rightContentX) + toOurWidth, Y(210));
  ctx.restore();

  // Dot separator row under the header
  if (dotSeparator) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(dotSeparator, X(rightContentX), Y(238), LEN(230), LEN(18));
    ctx.restore();
  }

  // ---- Shared row-drawing helper --------------------------------------
  function drawInfoRow({
    panelImg, panelRefW, panelRefH, y, h,
    tint, iconImg, iconRefSize, avatarRingImg, avatarImg,
    labelText, labelColor, valueText, valuePrefix,
  }) {
    const rowX = 700;
    // 990, not 1000: the outer glass panel spans ref-x 690–1700 (see
    // panelOuter above), so a row starting at 700 needs to end at 1690 to
    // get a matching 10px inset on the right — at 1000 wide it ran flush
    // to 1700, giving no right-side border while the left had one.
    const rowW = 990;

    if (panelImg) {
      drawImageFit(ctx, panelImg, X(rowX), Y(y), LEN(rowW), LEN(h));
    } else {
      ctx.save();
      roundedRectPath(ctx, X(rowX), Y(y), LEN(rowW), LEN(h), LEN(18));
      ctx.strokeStyle = tint;
      ctx.lineWidth = LEN(2.5);
      ctx.fillStyle = 'rgba(15, 6, 30, 0.55)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const tabCX = rowX + 45;
    const tabCY = y + h / 2;

    if (iconImg) {
      const iw = LEN(iconRefSize[0]);
      const ih = LEN(iconRefSize[1]);
      ctx.drawImage(iconImg, X(tabCX) - iw / 2, Y(tabCY) - ih / 2, iw, ih);
    }

    // Avatar
    const avCX2 = rowX + 175;
    const avCY2 = y + h / 2;
    const avR2 = h * 0.32;
    drawCircleAvatar(ctx, avatarImg, X(avCX2), Y(avCY2), LEN(avR2 * 0.92));

    // Label — stacked directly above the value/name text (same left edge,
    // rowX + 270) so it clears the avatar circle instead of sitting on
    // top of it (avatar right edge lands at ~rowX + 240, well short of
    // this X).
    drawAutoFitText(ctx, labelText, X(rowX + 270), Y(y + h * 0.28), {
      maxSize: LEN(22),
      minSize: LEN(14),
      maxWidth: LEN(rowW - 300),
      weight: 'normal',
      family: F_LABEL,
      align: 'left',
      color: labelColor,
    });
    if (avatarRingImg) {
      const s = avR2 * 2 * 1.12;
      ctx.drawImage(avatarRingImg, X(avCX2) - LEN(s) / 2, Y(avCY2) - LEN(s) / 2, LEN(s), LEN(s));
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(avCX2), Y(avCY2), LEN(avR2), 0, Math.PI * 2);
      ctx.strokeStyle = tint;
      ctx.lineWidth = LEN(3);
      ctx.stroke();
      ctx.restore();
    }

    // Value (name), auto-shrinking
    drawAutoFitText(ctx, valueText, X(rowX + 270), Y(avCY2), {
      maxSize: LEN(38),
      minSize: LEN(18),
      maxWidth: LEN(rowW - 300),
      weight: '800',
      family: F_DISPLAY,
      align: 'left',
      color: '#ffffff',
    });
  }

  // Row 1 — Group
  drawInfoRow({
    panelImg: panelGroupRow,
    y: 270,
    h: 222,
    tint: '#a63bff',
    iconImg: iconGroup,
    iconRefSize: [46, 46],
    avatarRingImg: ringGroup,
    avatarImg: groupAvatarImg,
    labelText: 'GROUP',
    labelColor: '#c98bff',
    valueText: groupName,
  });

  // Row 2 — Added By
  drawInfoRow({
    panelImg: panelAddedByRow,
    y: 500,
    h: 203,
    tint: '#f5a623',
    iconImg: iconAddedBy,
    iconRefSize: [46, 46],
    avatarRingImg: ringAddedBy,
    avatarImg: addedByAvatarImg,
    labelText: 'ADDED BY',
    labelColor: '#ffcf7a',
    valueText: addedBy,
  });

  // Row 3 — "MADE BY RIYAD" (static, per spec — must never change)
  const madeByY = 711;
  const madeByH = 147;
  const madeByCX = 1200;
  if (panelMadeByRow) {
    drawImageFit(ctx, panelMadeByRow, X(700), Y(madeByY), LEN(990), LEN(madeByH));
  }
  // decoration_001.png ("dotGrid") is ~78% opaque pixel fill — a dense
  // corner-flourish graphic, not a sparse dot pattern despite its name.
  // Stretched into a small 75x90 box it reads as a solid silhouette/blob,
  // so it's kept for the actual corner accent (left panel) only; here it's
  // replaced with the same small vector sparkle used next to "RIYAD" below.
  if (sparkleAsset) {
    const s = LEN(22);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sparkleAsset, X(750) - s / 2, Y(madeByY + 40) - s / 2, s, s);
    ctx.drawImage(sparkleAsset, X(1650) - s / 2, Y(madeByY + 40) - s / 2, s, s);
    ctx.restore();
  } else {
    drawSparkle(ctx, X(750), Y(madeByY + 40), LEN(9), '#c98bff');
    drawSparkle(ctx, X(1650), Y(madeByY + 40), LEN(9), '#c98bff');
  }

  drawAutoFitText(ctx, 'M A D E   B Y', X(madeByCX), Y(madeByY + 35), {
    maxSize: LEN(20),
    minSize: LEN(12),
    maxWidth: LEN(300),
    weight: 'normal',
    family: F_LABEL,
    align: 'center',
    color: '#c98bff',
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${LEN(56)}px ${F_DISPLAY}`;
  const riyadText = 'RIYAD';
  const riyadWidth = ctx.measureText(riyadText).width;
  const riyadGrad = ctx.createLinearGradient(
    X(madeByCX) - riyadWidth / 2, 0, X(madeByCX) + riyadWidth / 2, 0
  );
  riyadGrad.addColorStop(0, '#a63bff');
  riyadGrad.addColorStop(0.5, '#4c8bff');
  riyadGrad.addColorStop(1, '#38e0c6');
  ctx.fillStyle = riyadGrad;
  ctx.fillText(riyadText, X(madeByCX), Y(madeByY + 98));
  ctx.restore();

  if (sparkleAsset) {
    const s = LEN(24);
    ctx.drawImage(sparkleAsset, X(madeByCX) - riyadWidth / 2 - LEN(45) - s / 2, Y(madeByY + 98) - s / 2, s, s);
    ctx.drawImage(sparkleAsset, X(madeByCX) + riyadWidth / 2 + LEN(45) - s / 2, Y(madeByY + 98) - s / 2, s, s);
  }

  // ---- Return PNG buffer -------------------------------------------------
  if (typeof canvas.toBuffer === 'function') {
    return canvas.toBuffer('image/png');
  }
  return canvas;
}

module.exports = generateWelcomeCard;
module.exports.generateWelcomeCard = generateWelcomeCard;
module.exports.createWelcomeCard = generateWelcomeCard;
module.exports.welcomeCard = generateWelcomeCard;
