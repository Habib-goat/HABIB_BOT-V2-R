// Copies our fixed fca-riyad sendMessage.js into node_modules after every
// npm install, since Railway reinstalls dependencies fresh on each deploy
// and would otherwise overwrite our fix.
//
// We don't assume a fixed node_modules path — depending on the package
// manager (npm/pnpm/yarn) and how fca-eryxenx bundles fca-riyad, the real
// path can be nested (e.g. node_modules/fca-eryxenx/node_modules/fca-riyad/...
// or inside a pnpm .pnpm store). So we recursively search node_modules for
// every file that matches src/api/socket/sendMessage.js under a "fca-riyad"
// folder, and patch all of them found.

const fs = require("fs");
const path = require("path");

const patchedSrc = path.join(__dirname, "..", "patches", "sendMessage.js");
const nodeModulesRoot = path.join(__dirname, "..", "node_modules");
const relSuffix = path.join("fca-riyad", "src", "api", "socket", "sendMessage.js");

function findMatches(dir, matches, depth) {
  if (depth > 8) return; // safety cap, avoid runaway recursion
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (full.endsWith(relSuffix)) {
      matches.push(full);
      continue;
    }
    findMatches(full, matches, depth + 1);
  }
}

try {
  if (!fs.existsSync(patchedSrc)) {
    console.warn("[patch-fca] patched sendMessage.js not found at", patchedSrc);
    process.exit(0);
  }
  if (!fs.existsSync(nodeModulesRoot)) {
    console.warn("[patch-fca] node_modules not found, skipping:", nodeModulesRoot);
    process.exit(0);
  }

  const matches = [];
  findMatches(nodeModulesRoot, matches, 0);

  const directGuess = path.join(nodeModulesRoot, relSuffix);
  if (fs.existsSync(directGuess) && !matches.includes(directGuess)) {
    matches.push(directGuess);
  }

  if (!matches.length) {
    console.warn("[patch-fca] No sendMessage.js found under any fca-riyad folder in node_modules.");
    console.warn("[patch-fca] Run: find /app/node_modules -name sendMessage.js   to locate it manually.");
    process.exit(0);
  }

  for (const target of matches) {
    fs.copyFileSync(patchedSrc, target);
    console.log("[patch-fca] Patched:", target);
  }
  console.log(`[patch-fca] Done. Patched ${matches.length} file(s) ✅`);
} catch (e) {
  console.error("[patch-fca] Failed to apply patch:", e.message);
}
