/**
 * welcomeCardGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ultra-Premium Gaming/Cyberpunk Welcome Card Generator for Node.js & Web.
 * Renders 1536x1024 Photoshop-quality cards with 3D metallic typography,
 * electric/flame avatar rings, glassmorphism HUD panels, Japanese decorations,
 * and HDR lighting effects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let createCanvas, loadImage, registerFont;

// Try loading Node canvas library (@napi-rs/canvas or canvas) in Node environment
if (typeof window === 'undefined') {
  try {
    const napi = require('@napi-rs/canvas');
    createCanvas = napi.createCanvas;
    loadImage = napi.loadImage;
    registerFont = napi.GlobalFonts
      ? (path, opts) => napi.GlobalFonts.registerFromPath(path, opts && opts.family)
      : napi.registerFont;
  } catch (e1) {
    try {
      const c = require('canvas');
      createCanvas = c.createCanvas;
      loadImage = c.loadImage;
      registerFont = c.registerFont;
    } catch (e2) {
      // Browser or pure SVG fallback handled below
    }
  }
}

/**
 * 5 Iconic Master Themes
 */
const THEMES = {
  cyberpunk_neon: {
    id: "cyberpunk_neon",
    name: "Cyberpunk Dragon (Blue/Pink Dual Neon)",
    bgDark: "#050716",
    bgMid: "#0c0d28",
    primaryGlow: "#00f0ff",
    secondaryGlow: "#ff007f",
    accentColor: "#ff007f",
    textColor: "#ffffff",
    badgeBg: "linear-gradient(90deg, #00f0ff, #ff007f)",
    hudBg: "rgba(10, 14, 30, 0.85)",
    hudBorder: "#00f0ff",
    hudGlow: "rgba(0, 240, 255, 0.4)",
    ringType: "electric_dual",
    kanjiMain: "団結",
    kanjiSub: "伝説",
    subtextJapanese: "一緖に、最強になろう",
    styleTag: "CYBERPUNK"
  },
  inferno_fire: {
    id: "inferno_fire",
    name: "Inferno Volcanic Fire",
    bgDark: "#0d0202",
    bgMid: "#210603",
    primaryGlow: "#ff5500",
    secondaryGlow: "#ffaa00",
    accentColor: "#ff8800",
    textColor: "#ffffff",
    badgeBg: "linear-gradient(90deg, #ff3300, #ffaa00)",
    hudBg: "rgba(20, 5, 2, 0.88)",
    hudBorder: "#ff5500",
    hudGlow: "rgba(255, 85, 0, 0.5)",
    ringType: "fire_ring",
    kanjiMain: "火炎",
    kanjiSub: "無敵",
    subtextJapanese: "燃え上がれ、魂の炎",
    styleTag: "INFERNO"
  },
  tokyo_pink: {
    id: "tokyo_pink",
    name: "Tokyo Cyber Sakura (Magenta Night)",
    bgDark: "#08020e",
    bgMid: "#1a0628",
    primaryGlow: "#ff1493",
    secondaryGlow: "#8a2be2",
    accentColor: "#ff69b4",
    textColor: "#ffffff",
    badgeBg: "linear-gradient(90deg, #ff1493, #da70d6)",
    hudBg: "rgba(18, 5, 28, 0.85)",
    hudBorder: "#ff1493",
    hudGlow: "rgba(255, 20, 147, 0.45)",
    ringType: "neon_double",
    kanjiMain: "未来",
    kanjiSub: "歓迎",
    subtextJapanese: "未来を信じる・東京ナイト",
    styleTag: "TOKYO"
  },
  silver_diamond: {
    id: "silver_diamond",
    name: "Silver Obsidian Diamond",
    bgDark: "#050507",
    bgMid: "#121318",
    primaryGlow: "#e0e6ed",
    secondaryGlow: "#788896",
    accentColor: "#c0cdd8",
    textColor: "#ffffff",
    badgeBg: "linear-gradient(90deg, #8a9ba8, #e0e6ed)",
    hudBg: "rgba(15, 17, 22, 0.88)",
    hudBorder: "#a0b0c0",
    hudGlow: "rgba(200, 215, 230, 0.3)",
    ringType: "chrome_bevel",
    kanjiMain: "金剛",
    kanjiSub: "頂点",
    subtextJapanese: "漆黒の輝き、頂点へ",
    styleTag: "DIAMOND"
  },
  emerald_matrix: {
    id: "emerald_matrix",
    name: "Emerald Matrix Tech HUD",
    bgDark: "#020b05",
    bgMid: "#061f0e",
    primaryGlow: "#00ff66",
    secondaryGlow: "#00b33c",
    accentColor: "#00ff88",
    textColor: "#ffffff",
    badgeBg: "linear-gradient(90deg, #00b33c, #00ff66)",
    hudBg: "rgba(3, 18, 8, 0.88)",
    hudBorder: "#00ff66",
    hudGlow: "rgba(0, 255, 102, 0.4)",
    ringType: "matrix_circuit",
    kanjiMain: "電脳",
    kanjiSub: "覚醒",
    subtextJapanese: "システム接続完了・覚醒",
    styleTag: "MATRIX"
  }
};

/**
 * Utility: Draw high-tech chamfered (angled-corner) panel
 */
function drawChamferRect(ctx, x, y, width, height, chamfer) {
  ctx.beginPath();
  ctx.moveTo(x + chamfer, y);
  ctx.lineTo(x + width - chamfer, y);
  ctx.lineTo(x + width, y + chamfer);
  ctx.lineTo(x + width, y + height - chamfer);
  ctx.lineTo(x + width - chamfer, y + height);
  ctx.lineTo(x + chamfer, y + height);
  ctx.lineTo(x, y + height - chamfer);
  ctx.lineTo(x, y + chamfer);
  ctx.closePath();
}

/**
 * Utility: Generate realistic jagged electric lightning path
 */
function generateLightningPoints(x1, y1, x2, y2, roughness = 18, iterations = 5) {
  let points = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  for (let i = 0; i < iterations; i++) {
    const newPoints = [points[0]];
    for (let j = 0; j < points.length - 1; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / (len || 1);
      const ny = dx / (len || 1);
      const offset = (Math.random() - 0.5) * roughness * (1 / (i + 1));
      newPoints.push({ x: midX + nx * offset, y: midY + ny * offset });
      newPoints.push(p2);
    }
    points = newPoints;
  }
  return points;
}

/**
 * Render procedural Lightning Arc around a center point
 */
function drawLightningArcRing(ctx, cx, cy, radius, color, glowColor, numArcs = 8) {
  ctx.save();
  for (let i = 0; i < numArcs; i++) {
    const angle1 = (i / numArcs) * Math.PI * 2;
    const angle2 = ((i + 1) / numArcs) * Math.PI * 2;
    const x1 = cx + Math.cos(angle1) * radius;
    const y1 = cy + Math.sin(angle1) * radius;
    const x2 = cx + Math.cos(angle2) * radius;
    const y2 = cy + Math.sin(angle2) * radius;

    const points = generateLightningPoints(x1, y1, x2, y2, 22, 4);

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let p = 1; p < points.length; p++) {
      ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.stroke();

    ctx.shadowBlur = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw procedural Fire Ring Particles around avatar
 */
function drawFireRing(ctx, cx, cy, radius, theme) {
  ctx.save();

  const grad = ctx.createRadialGradient(cx, cy, radius - 20, cx, cy, radius + 40);
  grad.addColorStop(0, "rgba(255, 200, 0, 0.8)");
  grad.addColorStop(0.4, "rgba(255, 85, 0, 0.6)");
  grad.addColorStop(0.8, "rgba(200, 0, 0, 0.2)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 45, 0, Math.PI * 2);
  ctx.fill();

  const particleCount = 70;
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius + (Math.random() * 32 - 8);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const pSize = Math.random() * 12 + 4;

    ctx.shadowColor = i % 2 === 0 ? "#ffcc00" : "#ff3300";
    ctx.shadowBlur = 15;
    ctx.fillStyle = i % 3 === 0 ? "#ffffff" : (i % 2 === 0 ? "#ff9900" : "#ff2200");

    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowColor = "#ffaa00";
  ctx.shadowBlur = 25;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Japanese Kanji Stamp Badge
 */
function drawKanjiStamp(ctx, x, y, text, primaryColor) {
  ctx.save();

  ctx.fillStyle = "rgba(10, 10, 20, 0.75)";
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.rect(x, y, 54, 80);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, 48, 74);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const chars = text.split("");
  if (chars[0]) ctx.fillText(chars[0], x + 27, y + 26);
  if (chars[1]) ctx.fillText(chars[1], x + 27, y + 54);

  ctx.restore();
}

/**
 * Draw Japanese Cyber Dragon / Pattern Silhouette in background
 */
function drawDragonGraphics(ctx, width, height, theme) {
  ctx.save();
  ctx.globalAlpha = 0.18;

  ctx.fillStyle = theme.primaryGlow;
  ctx.beginPath();
  ctx.moveTo(80, 40);
  ctx.lineTo(240, 20);
  ctx.lineTo(190, 80);
  ctx.lineTo(310, 60);
  ctx.lineTo(260, 130);
  ctx.lineTo(380, 150);
  ctx.lineTo(220, 210);
  ctx.lineTo(160, 170);
  ctx.lineTo(120, 250);
  ctx.lineTo(60, 180);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = theme.secondaryGlow;
  ctx.beginPath();
  ctx.moveTo(width - 40, height - 200);
  ctx.lineTo(width - 180, height - 320);
  ctx.lineTo(width - 220, height - 240);
  ctx.lineTo(width - 340, height - 310);
  ctx.lineTo(width - 280, height - 160);
  ctx.lineTo(width - 400, height - 120);
  ctx.lineTo(width - 120, height - 40);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw 3D Metallic / Glowing Text with bevel, shadows, & depth
 */
function draw3DText(ctx, text, x, y, baseFontSize, theme, maxWidth) {
  ctx.save();

  let fontSize = baseFontSize;
  ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;

  while (ctx.measureText(text).width > maxWidth && fontSize > 36) {
    fontSize -= 4;
    ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;
  }

  const depth = 8;
  for (let i = depth; i > 0; i--) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#020308";
    ctx.fillText(text, x + i, y + i);
  }

  ctx.shadowColor = theme.primaryGlow;
  ctx.shadowBlur = 35;
  ctx.fillStyle = theme.primaryGlow;
  ctx.fillText(text, x, y);

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;

  const grad = ctx.createLinearGradient(x, y - fontSize, x, y);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.45, "#e6edf5");
  grad.addColorStop(0.50, "#88a0b5");
  grad.addColorStop(0.80, "#ffffff");
  grad.addColorStop(1, "#b0c4de");

  ctx.shadowBlur = 0;
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);

  ctx.restore();

  return { fontSize, textWidth };
}

/**
 * Main Welcome Card Generator Function
 * Accepts options object and outputs canvas or buffer
 */
async function generateWelcomeCard(options = {}) {
  const {
    memberName = "CYBER_WARRIOR",
    groupName = "NIGHT RAIDERS",
    memberId = "#2025-0988",
    addedBy = "SHADOW_X",
    avatarUrl = null,
    theme: themeKey = "cyberpunk_neon",
    themeColor = null,
    customTitle = "NEW MEMBER",
    customSubtitle = "JOINED GROUP",
    customLogoUrl = null,
    width = 1536,
    height = 1024,
    asDataUrl = false
  } = options;

  const baseTheme = THEMES[themeKey] || THEMES.cyberpunk_neon;
  const theme = { ...baseTheme };
  if (themeColor) {
    theme.primaryGlow = themeColor;
    theme.hudBorder = themeColor;
    theme.badgeBg = `linear-gradient(90deg, ${themeColor}, #ffffff)`;
  }

  let canvas, ctx;
  if (typeof window !== "undefined" && window.document) {
    canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
  } else if (createCanvas) {
    canvas = createCanvas(width, height);
    ctx = canvas.getContext("2d");
  } else {
    throw new Error("No canvas implementation found. Please install @napi-rs/canvas or canvas package.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. BACKGROUND
  const bgGrad = ctx.createRadialGradient(
    width * 0.35, height * 0.45, 100,
    width * 0.5, height * 0.5, width * 0.8
  );
  bgGrad.addColorStop(0, theme.bgMid);
  bgGrad.addColorStop(0.6, theme.bgDark);
  bgGrad.addColorStop(1, "#000206");

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1.5;
  const gridSize = 48;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  drawDragonGraphics(ctx, width, height, theme);

  ctx.save();
  ctx.translate(width * 0.3, height * 0.4);
  ctx.strokeStyle = theme.primaryGlow;
  ctx.globalAlpha = 0.06;
  ctx.lineWidth = 2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * width, Math.sin(a) * width);
    ctx.stroke();
  }
  ctx.restore();

  drawKanjiStamp(ctx, 48, 48, theme.kanjiMain, theme.primaryGlow);
  drawKanjiStamp(ctx, width - 102, 48, theme.kanjiSub, theme.secondaryGlow);

  ctx.save();
  ctx.strokeStyle = theme.primaryGlow;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.primaryGlow;
  ctx.shadowBlur = 15;

  ctx.beginPath();
  ctx.moveTo(120, 48);
  ctx.lineTo(380, 48);
  ctx.lineTo(410, 78);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width - 120, 48);
  ctx.lineTo(width - 380, 48);
  ctx.lineTo(width - 410, 78);
  ctx.stroke();

  ctx.restore();

  // 2. AVATAR SECTION
  const avCenterX = 340;
  const avCenterY = 440;
  const avRadius = 200;

  const avGlow = ctx.createRadialGradient(
    avCenterX, avCenterY, avRadius * 0.8,
    avCenterX, avCenterY, avRadius * 1.6
  );
  avGlow.addColorStop(0, theme.primaryGlow);
  avGlow.addColorStop(0.5, theme.secondaryGlow);
  avGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = avGlow;
  ctx.beginPath();
  ctx.arc(avCenterX, avCenterY, avRadius * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (theme.ringType === "fire_ring") {
    drawFireRing(ctx, avCenterX, avCenterY, avRadius, theme);
  } else if (theme.ringType === "electric_dual") {
    drawLightningArcRing(ctx, avCenterX, avCenterY, avRadius + 14, theme.primaryGlow, theme.primaryGlow, 10);
    drawLightningArcRing(ctx, avCenterX, avCenterY, avRadius + 24, theme.secondaryGlow, theme.secondaryGlow, 8);
  } else {
    ctx.save();
    ctx.shadowColor = theme.primaryGlow;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = theme.primaryGlow;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(avCenterX, avCenterY, avRadius + 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = theme.secondaryGlow;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avCenterX, avCenterY, avRadius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(avCenterX, avCenterY, avRadius, 0, Math.PI * 2);
  ctx.clip();

  let avatarLoaded = false;
  if (avatarUrl && loadImage) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.drawImage(img, avCenterX - avRadius, avCenterY - avRadius, avRadius * 2, avRadius * 2);
      avatarLoaded = true;
    } catch (err) {
      // Fallback silhouette
    }
  }

  if (!avatarLoaded) {
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(avCenterX - avRadius, avCenterY - avRadius, avRadius * 2, avRadius * 2);

    ctx.strokeStyle = theme.primaryGlow;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 2;
    for (let i = -avRadius; i < avRadius; i += 24) {
      ctx.beginPath();
      ctx.moveTo(avCenterX + i, avCenterY - avRadius);
      ctx.lineTo(avCenterX + i, avCenterY + avRadius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = theme.primaryGlow;
    ctx.shadowColor = theme.primaryGlow;
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(avCenterX, avCenterY - 90);
    ctx.lineTo(avCenterX + 70, avCenterY - 20);
    ctx.lineTo(avCenterX + 50, avCenterY + 50);
    ctx.lineTo(avCenterX - 50, avCenterY + 50);
    ctx.lineTo(avCenterX - 70, avCenterY - 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(avCenterX - 25, avCenterY - 10, 18, 6, -0.2, 0, Math.PI * 2);
    ctx.ellipse(avCenterX + 25, avCenterY - 10, 18, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avCenterX, avCenterY, avRadius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 3. MAIN TYPOGRAPHY
  const textX = 610;

  ctx.save();
  ctx.fillStyle = theme.primaryGlow;
  ctx.shadowColor = theme.primaryGlow;
  ctx.shadowBlur = 12;
  ctx.font = "700 32px 'Arial', sans-serif";
  ctx.fillText(`❖ ${customTitle.toUpperCase()} ❖`, textX, 230);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "400 22px sans-serif";
  ctx.fillText(theme.subtextJapanese, textX + 340, 230);
  ctx.restore();

  draw3DText(ctx, memberName.toUpperCase(), textX, 350, 110, theme, width - textX - 80);

  ctx.save();
  ctx.fillStyle = theme.accentColor;
  ctx.shadowColor = theme.accentColor;
  ctx.shadowBlur = 22;
  ctx.font = "italic 900 48px 'Impact', 'Arial Black', sans-serif";
  ctx.fillText(`${customSubtitle.toUpperCase()} ★ ${groupName.toUpperCase()}`, textX, 430);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = theme.primaryGlow;
  ctx.shadowBlur = 15;

  const lineGrad = ctx.createLinearGradient(textX, 0, width - 100, 0);
  lineGrad.addColorStop(0, theme.primaryGlow);
  lineGrad.addColorStop(0.5, theme.secondaryGlow);
  lineGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(textX, 465);
  ctx.lineTo(width - 120, 465);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(textX, 465, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. GLASSMORPHISM HUD PANEL
  const hudX = 90;
  const hudY = 720;
  const hudW = width - 180;
  const hudH = 220;
  const chamfer = 24;

  ctx.save();
  drawChamferRect(ctx, hudX, hudY, hudW, hudH, chamfer);
  ctx.fillStyle = theme.hudBg;
  ctx.fill();

  ctx.shadowColor = theme.hudBorder;
  ctx.shadowBlur = 25;
  ctx.strokeStyle = theme.hudBorder;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  drawChamferRect(ctx, hudX + 4, hudY + 4, hudW - 8, hudH - 8, chamfer - 2);
  ctx.stroke();
  ctx.restore();

  const cols = [
    { title: "MEMBER ID", value: memberId, icon: "🪪" },
    { title: "ADDED BY", value: addedBy, icon: "👑" },
    { title: "GROUP", value: groupName, icon: "👥" }
  ];

  const colWidth = hudW / 3;

  cols.forEach((col, idx) => {
    const colX = hudX + idx * colWidth + colWidth / 2;

    if (idx > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hudX + idx * colWidth, hudY + 30);
      ctx.lineTo(hudX + idx * colWidth, hudY + hudH - 30);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    const iconBoxY = hudY + 42;
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.strokeStyle = theme.primaryGlow;
    ctx.lineWidth = 1.5;
    drawChamferRect(ctx, colX - 28, iconBoxY, 56, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(col.icon, colX, iconBoxY + 22);

    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.font = "bold 18px 'Arial', sans-serif";
    ctx.fillText(col.title, colX, hudY + 120);

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = theme.primaryGlow;
    ctx.shadowBlur = 8;
    ctx.font = "900 28px 'Impact', 'Arial Black', sans-serif";

    let displayVal = col.value.toString();
    if (displayVal.length > 18) {
      displayVal = displayVal.slice(0, 16) + "…";
    }
    ctx.fillText(displayVal, colX, hudY + 165);

    ctx.restore();
  });

  // 5. FOOTER
  ctx.save();
  ctx.shadowColor = theme.primaryGlow;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Impact', 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("❖ 一緒に、最強になろう ❖ Made By RIYAD BOT ❖", width / 2, height - 36);
  ctx.restore();

  if (asDataUrl && canvas.toDataURL) {
    return canvas.toDataURL("image/png");
  } else if (canvas.toBuffer) {
    return canvas.toBuffer("image/png");
  } else {
    return canvas;
  }
}

module.exports = generateWelcomeCard;
module.exports.generateWelcomeCard = generateWelcomeCard;
module.exports.welcomeCardGenerator = generateWelcomeCard;
module.exports.THEMES = THEMES;
