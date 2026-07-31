/**
 * welcomeCardGenerator.js
 * High-Quality Node.js Canvas Welcome Card Generator
 * Matches Canva Template Design with 100% Precision
 *
 * Fixed for compatibility with RIYAD BOT (CommonJS project, "canvas" package).
 * Also supports Bangla (বাংলা) text via bundled Hind Siliguri font, falling
 * back to whatever system fonts are available (e.g. fonts-noto in Docker).
 */

const path = require('path');
const fs = require('fs');

// Load Node canvas library. This project ships the "canvas" package, but we
// also try "@napi-rs/canvas" first in case it's available/faster, then fall
// back gracefully instead of crashing at require-time.
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

/**
 * Register bundled fonts (Poppins for English, Hind Siliguri for Bangla) if
 * the .ttf files exist in ./fonts. Safe to call multiple times; silently
 * skips missing files so the bot still works without them (falls back to
 * system fonts, e.g. fonts-noto installed via Docker).
 */
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const fontsDir = path.join(__dirname, 'fonts');
  const fontFiles = [
    { file: 'Poppins-Bold.ttf', family: 'Poppins', weight: 'bold' },
    { file: 'Poppins-Regular.ttf', family: 'Poppins', weight: 'normal' },
    { file: 'HindSiliguri-Bold.ttf', family: 'Hind Siliguri', weight: 'bold' },
    { file: 'HindSiliguri-Regular.ttf', family: 'Hind Siliguri', weight: 'normal' },
  ];

  for (const f of fontFiles) {
    try {
      const fullPath = path.join(fontsDir, f.file);
      if (fs.existsSync(fullPath) && typeof registerFont === 'function') {
        registerFont(fullPath, { family: f.family, weight: f.weight });
      }
    } catch (err) {
      console.error('[welcomeCardGenerator] Font registration failed for', f.file, err?.message || err);
    }
  }
}

/**
 * Font stack used everywhere text is drawn. "Hind Siliguri" (and the
 * "Noto Sans Bengali" system fallback) makes Bangla (বাংলা) render as real
 * glyphs instead of tofu boxes, while still preferring the English display
 * fonts for latin text.
 */
const FONT_STACK = '"Hind Siliguri", "Noto Sans Bengali", "Trebuchet MS", "Segoe UI", "Arial", sans-serif';
const FONT_STACK_DISPLAY = '"Hind Siliguri", "Noto Sans Bengali", "Arial Black", "Impact", "Trebuchet MS", sans-serif';

/**
 * Format date into "30 Jul 2026, 08:30 PM" format, always in
 * Bangladesh Standard Time (Asia/Dhaka, UTC+6) — independent of what
 * timezone the server itself runs in.
 */
function formatDate(dateInput) {
  // If a plain, already-formatted string was passed in (not a Date/number),
  // keep it as-is instead of trying to reparse it.
  if (typeof dateInput === 'string' && dateInput.trim() !== '') {
    return dateInput;
  }

  const date = dateInput instanceof Date ? dateInput : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(validDate);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  let hour = get('hour');
  const minute = get('minute');
  let ampm = (get('dayPeriod') || '').toUpperCase();
  // Some Node/ICU builds render "am"/"pm" lowercase or "in the morning" —
  // normalize to AM/PM, and pad the hour to 2 digits.
  ampm = ampm.startsWith('P') ? 'PM' : 'AM';
  hour = String(hour).padStart(2, '0');

  return `${day} ${month} ${year}, ${hour}:${minute} ${ampm}`;
}

/**
 * Helper to draw rounded rectangle
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Helper to draw 4-point sparkle star
 */
function drawSparkleStar(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx, cy, cx + size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + size);
  ctx.quadraticCurveTo(cx, cy, cx - size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - size);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw cross plus icon
 */
function drawCross(ctx, cx, cy, size, thickness, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(cx - thickness / 2, cy - size / 2, thickness, size);
  ctx.fillRect(cx - size / 2, cy - thickness / 2, size, thickness);
  ctx.restore();
}

/**
 * Helper to draw heart
 */
function drawHeart(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy, cx - size / 2, cy - topCurveHeight, cx - size / 2, cy + topCurveHeight / 2);
  ctx.bezierCurveTo(cx - size / 2, cy + (size + topCurveHeight) / 2, cx, cy + size * 0.8, cx, cy + size);
  ctx.bezierCurveTo(cx, cy + size * 0.8, cx + size / 2, cy + (size + topCurveHeight) / 2, cx + size / 2, cy + topCurveHeight / 2);
  ctx.bezierCurveTo(cx + size / 2, cy - topCurveHeight, cx, cy, cx, cy + size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw vector icons inside row boxes
 */
function drawRowIcon(ctx, iconType, x, y, size) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = x + size / 2;
  const cy = y + size / 2;

  switch (iconType) {
    case 'person': {
      // Head
      ctx.beginPath();
      ctx.arc(cx, cy - 5, 5, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.beginPath();
      ctx.arc(cx, cy + 9, 9, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'id': {
      // ID Card Badge
      drawRoundedRect(ctx, cx - 11, cy - 9, 22, 18, 3);
      ctx.stroke();
      // Photo square inside badge
      ctx.fillRect(cx - 8, cy - 5, 6, 6);
      // Small lines
      ctx.fillRect(cx + 1, cy - 5, 6, 1.5);
      ctx.fillRect(cx + 1, cy - 2, 6, 1.5);
      ctx.fillRect(cx - 8, cy + 3, 15, 1.5);
      break;
    }
    case 'group': {
      // Two overlapping persons
      // Left person
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 4, cy + 8, 7, Math.PI, Math.PI * 2);
      ctx.fill();
      // Right person
      ctx.beginPath();
      ctx.arc(cx + 5, cy - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, cy + 8, 6, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'addedBy': {
      // Person + Plus sign
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 3, cy + 8, 7.5, Math.PI, Math.PI * 2);
      ctx.fill();
      // Plus sign
      drawCross(ctx, cx + 7, cy - 1, 7, 2, '#ffffff');
      break;
    }
    case 'calendar': {
      // Calendar box
      drawRoundedRect(ctx, cx - 10, cy - 8, 20, 18, 3);
      ctx.stroke();
      // Top line
      ctx.fillRect(cx - 10, cy - 4, 20, 2);
      // Binder loops
      ctx.fillRect(cx - 6, cy - 10, 2, 3);
      ctx.fillRect(cx + 4, cy - 10, 2, 3);
      // Grid dots / checkmark
      ctx.fillRect(cx - 6, cy, 3, 3);
      ctx.fillRect(cx - 1, cy, 3, 3);
      ctx.fillRect(cx + 4, cy, 3, 3);
      ctx.fillRect(cx - 6, cy + 4, 3, 3);
      ctx.fillRect(cx - 1, cy + 4, 3, 3);
      break;
    }
    case 'members': {
      // Member list / group icon
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 5, cy + 7, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + 5, cy - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 5, cy + 7, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draw default fallback silhouette avatar
 */
function drawDefaultAvatar(ctx, cx, cy, radius) {
  ctx.save();
  // Black background circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#111111';
  ctx.fill();

  // White avatar shape
  ctx.fillStyle = '#ffffff';
  // Head
  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.2, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(cx, cy + radius * 0.75, radius * 0.65, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Main Welcome Card Generator Function
 */
async function generateWelcomeCard(optionsOrAvatar, nameParam, groupParam, memberIdParam, addedByParam, joinedOnParam, totalMembersParam) {
  ensureFontsRegistered();

  // Parse options flexible arguments
  let opts = {};
  if (typeof optionsOrAvatar === 'object' && optionsOrAvatar !== null && !Buffer.isBuffer(optionsOrAvatar)) {
    opts = optionsOrAvatar;
  } else {
    opts = {
      avatar: optionsOrAvatar,
      name: nameParam,
      groupName: groupParam,
      userId: memberIdParam,
      addedBy: addedByParam,
      joinedOn: joinedOnParam,
      totalMembers: totalMembersParam,
    };
  }

  // Extract dynamic values with flexible fallbacks
  const avatarInput = opts.avatar || opts.avatarUrl || opts.avatarURL || opts.userAvatar || opts.icon || opts.image;
  const memberName = String(opts.name || opts.memberName || opts.username || opts.user || opts.member || 'Riyad Ahmed');
  const userId = String(opts.userId || opts.memberId || opts.id || opts.user_id || '100012345678901');
  const groupName = String(opts.groupName || opts.group || opts.guildName || opts.serverName || opts.title || 'CHADER ALO ADDA BOX');
  const addedBy = String(opts.addedBy || opts.inviter || opts.referrer || opts.added_by || 'Bad Boy Riyad');
  const joinedOn = formatDate(opts.joinedOn || opts.joinedAt || opts.date || opts.time);
  const totalMembers = String(opts.totalMembers || opts.memberCount || opts.members || opts.count || '256 Members');

  // Canvas Dimensions (HD 1280 x 720)
  const width = opts.width || 1280;
  const height = opts.height || 720;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Enable high-quality anti-aliasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. BASE BACKGROUND GRADIENT
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0a021a');
  bgGrad.addColorStop(0.35, '#150630');
  bgGrad.addColorStop(0.7, '#1b073b');
  bgGrad.addColorStop(1, '#070114');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. BACKGROUND GLOWING NEON CORNER WAVES & BLOBS
  // Top-Left Wave
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(380, 0);
  ctx.bezierCurveTo(320, 100, 200, 180, 0, 220);
  ctx.closePath();
  const wave1Grad = ctx.createLinearGradient(0, 0, 300, 200);
  wave1Grad.addColorStop(0, 'rgba(140, 25, 230, 0.7)');
  wave1Grad.addColorStop(0.6, 'rgba(85, 12, 160, 0.5)');
  wave1Grad.addColorStop(1, 'rgba(35, 5, 80, 0.1)');
  ctx.fillStyle = wave1Grad;
  ctx.fill();
  ctx.strokeStyle = '#c842ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#d95eff';
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();

  // Top-Right Wave
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.lineTo(920, 0);
  ctx.bezierCurveTo(980, 80, 1080, 150, width, 180);
  ctx.closePath();
  const wave2Grad = ctx.createLinearGradient(width, 0, 950, 150);
  wave2Grad.addColorStop(0, 'rgba(155, 30, 240, 0.7)');
  wave2Grad.addColorStop(1, 'rgba(40, 5, 85, 0.1)');
  ctx.fillStyle = wave2Grad;
  ctx.fill();
  ctx.strokeStyle = '#d448ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#e262ff';
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  // Bottom-Left Wave
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, 480);
  ctx.bezierCurveTo(150, 520, 260, 620, 320, height);
  ctx.closePath();
  const wave3Grad = ctx.createLinearGradient(0, height, 250, 500);
  wave3Grad.addColorStop(0, 'rgba(130, 20, 220, 0.75)');
  wave3Grad.addColorStop(1, 'rgba(30, 4, 70, 0.1)');
  ctx.fillStyle = wave3Grad;
  ctx.fill();
  ctx.strokeStyle = '#b832ff';
  ctx.lineWidth = 3.5;
  ctx.shadowColor = '#cf44ff';
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();

  // Bottom-Right Corner Waves (Multi-layered)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(width, height);
  ctx.lineTo(800, height);
  ctx.bezierCurveTo(920, 630, 1080, 520, width, 450);
  ctx.closePath();
  const wave4Grad = ctx.createLinearGradient(width, height, 850, 500);
  wave4Grad.addColorStop(0, 'rgba(165, 35, 250, 0.8)');
  wave4Grad.addColorStop(0.5, 'rgba(105, 18, 180, 0.5)');
  wave4Grad.addColorStop(1, 'rgba(40, 5, 85, 0.1)');
  ctx.fillStyle = wave4Grad;
  ctx.fill();
  ctx.strokeStyle = '#e058ff';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#f075ff';
  ctx.shadowBlur = 25;
  ctx.stroke();
  ctx.restore();

  // Bottom Right Diagonal Stripes (////)
  ctx.save();
  ctx.strokeStyle = 'rgba(215, 85, 255, 0.35)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(1120 + i * 20, 680);
    ctx.lineTo(1210 + i * 20, 590);
    ctx.stroke();
  }
  ctx.restore();

  // 3. BACKGROUND DECORATIVE ELEMENTS (Rings, Sparkles, Crosses, Dots)
  // Large Hollow Rings
  ctx.save();
  ctx.strokeStyle = '#a822f0';
  ctx.lineWidth = 8;
  ctx.shadowColor = '#c842ff';
  ctx.shadowBlur = 15;
  // Ring top left
  ctx.beginPath();
  ctx.arc(310, 130, 16, 0, Math.PI * 2);
  ctx.stroke();
  // Ring top right
  ctx.beginPath();
  ctx.arc(1050, 135, 16, 0, Math.PI * 2);
  ctx.stroke();
  // Ring left bottom
  ctx.beginPath();
  ctx.arc(58, 598, 14, 0, Math.PI * 2);
  ctx.stroke();
  // Large Ring right middle
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#9d1ee6';
  ctx.beginPath();
  ctx.arc(1155, 480, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Sparkles (✦)
  drawSparkleStar(ctx, 380, 190, 8, '#ffffff');
  drawSparkleStar(ctx, 430, 310, 6, '#e27eff');
  drawSparkleStar(ctx, 990, 180, 9, '#ffffff');
  drawSparkleStar(ctx, 1110, 330, 7, '#d862ff');
  drawSparkleStar(ctx, 90, 310, 8, '#ffffff');

  // Crosses (+)
  drawCross(ctx, 60, 200, 14, 3.5, '#bd3aff');
  drawCross(ctx, 70, 280, 18, 4, '#ffffff');
  drawCross(ctx, 35, 380, 16, 3.5, '#a82ee6');
  drawCross(ctx, 1090, 240, 16, 3.5, '#c842ff');
  drawCross(ctx, 1150, 610, 16, 3.5, '#e058ff');
  drawCross(ctx, 280, 830, 14, 3, '#ffffff');
  drawCross(ctx, 280, 840, 14, 3, '#ffffff');
  drawCross(ctx, 280, 628, 14, 3, '#c23bff');

  // Dot Grids (:::)
  ctx.save();
  ctx.fillStyle = 'rgba(185, 60, 255, 0.5)';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.beginPath();
      ctx.arc(1180 + c * 10, 310 + r * 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 4. HEADER SECTION ("WELCOME" Title & "✦ TO OUR GROUP ✦" Badge)
  const headerCenterX = 670;

  // Title: WELCOME
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic bold 72px ${FONT_STACK_DISPLAY}`;

  // 3D Extrusion Shadow effect
  for (let s = 6; s >= 1; s--) {
    ctx.fillStyle = s === 6 ? 'rgba(10, 1, 25, 0.9)' : '#3b0666';
    ctx.fillText('WELCOME', headerCenterX + s * 1.5, 78 + s * 1.5);
  }

  // Neon Outer Glow
  ctx.shadowColor = '#d942ff';
  ctx.shadowBlur = 25;

  // Thick outline stroke
  ctx.strokeStyle = '#3d0263';
  ctx.lineWidth = 10;
  ctx.strokeText('WELCOME', headerCenterX, 78);

  // Gradient Text Fill
  const textGrad = ctx.createLinearGradient(headerCenterX, 45, headerCenterX, 110);
  textGrad.addColorStop(0, '#ffffff');
  textGrad.addColorStop(0.5, '#f0c8ff');
  textGrad.addColorStop(1, '#c875ff');
  ctx.fillStyle = textGrad;
  ctx.fillText('WELCOME', headerCenterX, 78);
  ctx.restore();

  // Subtitle Pill: ✦ TO OUR GROUP ✦
  ctx.save();
  const pillY = 132;
  const pillW = 240;
  const pillH = 34;
  const pillX = headerCenterX - pillW / 2;

  // Side lines with diamond terminals
  ctx.strokeStyle = '#c842ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#d942ff';
  ctx.shadowBlur = 10;

  // Left side line
  ctx.beginPath();
  ctx.moveTo(headerCenterX - 230, pillY);
  ctx.lineTo(pillX - 10, pillY);
  ctx.stroke();

  // Right side line
  ctx.beginPath();
  ctx.moveTo(pillX + pillW + 10, pillY);
  ctx.lineTo(headerCenterX + 230, pillY);
  ctx.stroke();

  // Side diamonds
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(headerCenterX - 235, pillY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(headerCenterX + 235, pillY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Pill Box
  drawRoundedRect(ctx, pillX, pillY - pillH / 2, pillW, pillH, 17);
  const pillGrad = ctx.createLinearGradient(pillX, pillY - pillH / 2, pillX, pillY + pillH / 2);
  pillGrad.addColorStop(0, 'rgba(80, 15, 130, 0.85)');
  pillGrad.addColorStop(1, 'rgba(40, 5, 75, 0.85)');
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.strokeStyle = '#d442ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pill Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 16px ${FONT_STACK}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#e882ff';
  ctx.shadowBlur = 8;
  ctx.fillText('✦  TO OUR GROUP  ✦', headerCenterX, pillY);
  ctx.restore();

  // 5. LEFT SECTION: AVATAR FRAME & RIBBON
  const avatarCX = 245;
  const avatarCY = 360;
  const avatarRadius = 130;

  // Outer Glowing Rings
  ctx.save();
  // Outer Ring 1
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarRadius + 24, 0, Math.PI * 2);
  ctx.strokeStyle = '#b82ee6';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#d942ff';
  ctx.shadowBlur = 20;
  ctx.stroke();

  // Outer Ring 2 (closer)
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarRadius + 14, 0, Math.PI * 2);
  ctx.strokeStyle = '#e058ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Crosshair Ticks at N, S, E, W
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const ticks = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
  ticks.forEach(angle => {
    const x1 = avatarCX + Math.cos(angle) * (avatarRadius + 10);
    const y1 = avatarCY + Math.sin(angle) * (avatarRadius + 10);
    const x2 = avatarCX + Math.cos(angle) * (avatarRadius + 28);
    const y2 = avatarCY + Math.sin(angle) * (avatarRadius + 28);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  ctx.restore();

  // Avatar Image or Default Silhouette
  ctx.save();
  let avatarLoaded = false;
  if (avatarInput) {
    try {
      let img;
      if (typeof avatarInput === 'string' || Buffer.isBuffer(avatarInput)) {
        img = await loadImage(avatarInput);
      } else {
        img = avatarInput;
      }
      if (img) {
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, avatarRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarCX - avatarRadius, avatarCY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        avatarLoaded = true;
      }
    } catch (err) {
      avatarLoaded = false;
    }
  }

  if (!avatarLoaded) {
    drawDefaultAvatar(ctx, avatarCX, avatarCY, avatarRadius);
  }
  ctx.restore();

  // Avatar Border Stroke
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarRadius, 0, Math.PI * 2);
  ctx.strokeStyle = '#e66eff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#f07bff';
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.restore();

  // Overlapping Ribbon Banner ("★ NEW MEMBER ★")
  ctx.save();
  const ribbonCY = 520;
  const ribbonW = 310;
  const ribbonH = 48;
  const ribbonX = avatarCX - ribbonW / 2;

  // Ribbon Banner Glow
  ctx.shadowColor = '#d942ff';
  ctx.shadowBlur = 20;

  // Folded Ends (Back tails)
  ctx.fillStyle = '#3c0463';
  // Left fold tail
  ctx.beginPath();
  ctx.moveTo(ribbonX - 15, ribbonCY - 15);
  ctx.lineTo(ribbonX + 15, ribbonCY - 24);
  ctx.lineTo(ribbonX + 15, ribbonCY + 24);
  ctx.lineTo(ribbonX - 15, ribbonCY + 15);
  ctx.lineTo(ribbonX - 5, ribbonCY);
  ctx.closePath();
  ctx.fill();

  // Right fold tail
  ctx.beginPath();
  ctx.moveTo(ribbonX + ribbonW + 15, ribbonCY - 15);
  ctx.lineTo(ribbonX + ribbonW - 15, ribbonCY - 24);
  ctx.lineTo(ribbonX + ribbonW - 15, ribbonCY + 24);
  ctx.lineTo(ribbonX + ribbonW + 15, ribbonCY + 15);
  ctx.lineTo(ribbonX + ribbonW + 5, ribbonCY);
  ctx.closePath();
  ctx.fill();

  // Main Ribbon Body
  drawRoundedRect(ctx, ribbonX, ribbonCY - ribbonH / 2, ribbonW, ribbonH, 12);
  const ribbonGrad = ctx.createLinearGradient(ribbonX, ribbonCY - ribbonH / 2, ribbonX, ribbonCY + ribbonH / 2);
  ribbonGrad.addColorStop(0, '#a518e8');
  ribbonGrad.addColorStop(0.5, '#7b0dc2');
  ribbonGrad.addColorStop(1, '#53048a');
  ctx.fillStyle = ribbonGrad;
  ctx.fill();

  ctx.strokeStyle = '#f2a6ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Ribbon Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px ${FONT_STACK_DISPLAY}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#210038';
  ctx.shadowBlur = 6;
  ctx.fillText('★ NEW MEMBER ★', avatarCX, ribbonCY);
  ctx.restore();

  // 6. RIGHT SECTION: INFO BOX
  const boxX = 460;
  const boxY = 205;
  const boxW = 680;
  const boxH = 385;
  const boxRadius = 24;

  ctx.save();
  // Outer Box Shadow Glow
  ctx.shadowColor = 'rgba(195, 55, 255, 0.65)';
  ctx.shadowBlur = 25;

  // Box Background
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, boxRadius);
  const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
  boxGrad.addColorStop(0, 'rgba(22, 6, 45, 0.82)');
  boxGrad.addColorStop(1, 'rgba(10, 2, 24, 0.88)');
  ctx.fillStyle = boxGrad;
  ctx.fill();

  // Glowing Double Stroke
  ctx.strokeStyle = '#be3aff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Info Box Rows
  const rows = [
    { icon: 'person', label: 'Name', value: memberName },
    { icon: 'id', label: 'User ID', value: userId },
    { icon: 'group', label: 'Group', value: groupName },
    { icon: 'addedBy', label: 'Added By', value: addedBy },
    { icon: 'calendar', label: 'Joined On', value: joinedOn },
    { icon: 'members', label: 'Total Members', value: totalMembers },
  ];

  const rowStartY = boxY + 22;
  const rowHeight = 56;

  rows.forEach((row, idx) => {
    const rowY = rowStartY + idx * rowHeight;

    // Horizontal Row Separator (except last row)
    if (idx < rows.length - 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX + 25, rowY + rowHeight - 6);
      ctx.lineTo(boxX + boxW - 25, rowY + rowHeight - 6);
      ctx.stroke();
      ctx.restore();
    }

    // Icon Rounded Square Container
    const iconBoxX = boxX + 28;
    const iconBoxY = rowY + 3;
    const iconBoxSize = 38;

    ctx.save();
    drawRoundedRect(ctx, iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 10);
    const iconGrad = ctx.createLinearGradient(iconBoxX, iconBoxY, iconBoxX, iconBoxY + iconBoxSize);
    iconGrad.addColorStop(0, 'rgba(110, 25, 185, 0.85)');
    iconGrad.addColorStop(1, 'rgba(60, 10, 110, 0.85)');
    ctx.fillStyle = iconGrad;
    ctx.fill();

    ctx.strokeStyle = '#a830f5';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Vector Icon Inside
    drawRowIcon(ctx, row.icon, iconBoxX, iconBoxY, iconBoxSize);
    ctx.restore();

    // Label Text
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 18px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    const labelX = boxX + 85;
    const centerY = iconBoxY + iconBoxSize / 2;
    ctx.fillText(row.label, labelX, centerY);

    // Vertical Separator Line |
    const sepX = boxX + 215;
    ctx.strokeStyle = 'rgba(210, 160, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sepX, centerY - 12);
    ctx.lineTo(sepX, centerY + 12);
    ctx.stroke();

    // Value Text (Auto-scaling font size if value is long)
    const valX = boxX + 240;
    const maxValWidth = boxW - 265;
    let valFontSize = 19;
    ctx.font = `bold ${valFontSize}px ${FONT_STACK}`;

    while (ctx.measureText(row.value).width > maxValWidth && valFontSize > 12) {
      valFontSize -= 1;
      ctx.font = `bold ${valFontSize}px ${FONT_STACK}`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#e288ff';
    ctx.shadowBlur = 6;
    ctx.fillText(row.value, valX, centerY);
    ctx.restore();
  });

  // 7. BOTTOM SECTION ("Thanks For Joining Us!" with Hearts & Lines)
  ctx.save();
  const bottomY = 648;
  const thanksText = 'Thanks For Joining Us!';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 26px ${FONT_STACK}`;
  const textWidth = ctx.measureText(thanksText).width;

  // Center Text Fill & Glow
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#d942ff';
  ctx.shadowBlur = 15;
  ctx.fillText(thanksText, headerCenterX, bottomY);

  // Side Hearts
  const heartOffset = textWidth / 2 + 30;
  drawHeart(ctx, headerCenterX - heartOffset, bottomY - 8, 18, '#bd26ff');
  drawHeart(ctx, headerCenterX + heartOffset, bottomY - 8, 18, '#bd26ff');

  // Decorative Side Accent Lines with circles
  ctx.strokeStyle = 'rgba(210, 80, 255, 0.6)';
  ctx.lineWidth = 2;

  // Left line
  const leftLineEnd = headerCenterX - heartOffset - 25;
  const leftLineStart = leftLineEnd - 120;
  ctx.beginPath();
  ctx.moveTo(leftLineStart, bottomY);
  ctx.lineTo(leftLineEnd, bottomY);
  ctx.stroke();

  // Left line circles
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(leftLineStart + i * 12 - 25, bottomY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#ffffff' : '#c842ff';
    ctx.fill();
  }

  // Right line
  const rightLineStart = headerCenterX + heartOffset + 25;
  const rightLineEnd = rightLineStart + 120;
  ctx.beginPath();
  ctx.moveTo(rightLineStart, bottomY);
  ctx.lineTo(rightLineEnd, bottomY);
  ctx.stroke();

  // Right line circles
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(rightLineEnd + i * 12 + 10, bottomY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = i === 3 ? '#ffffff' : '#c842ff';
    ctx.fill();
  }

  ctx.restore();

  // Return Buffer (PNG)
  if (typeof canvas.toBuffer === 'function') {
    return canvas.toBuffer('image/png');
  }
  return canvas;
}

// Exports (CommonJS) — supports every way the bot's code loads this module:
//   const generateWelcomeCard = require('./welcomeCardGenerator');
//   const { generateWelcomeCard } = require('./welcomeCardGenerator');
module.exports = generateWelcomeCard;
module.exports.generateWelcomeCard = generateWelcomeCard;
module.exports.createWelcomeCard = generateWelcomeCard;
module.exports.welcomeCard = generateWelcomeCard;
