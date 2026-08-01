// Runtime patch (NOT postinstall-based — that was unreliable on this host,
// likely due to build caching skipping npm install / postinstall scripts).
//
// This runs synchronously at the very top of app.js, on every single boot,
// BEFORE fca-riyad is ever require()'d anywhere else in the codebase. It
// copies our fixed sendMessage.js over the installed one in node_modules.
// Because it's plain fs + require() timing (not tied to npm lifecycle),
// it works regardless of build cache behavior.

const fs = require("fs");
const path = require("path");

module.exports = function applyFcaPatch() {
  const patchedSrc = path.join(__dirname, "..", "patches", "sendMessage.js");
  const nodeModulesRoot = path.join(__dirname, "..", "node_modules");
  const relSuffix = path.join("fca-riyad", "src", "api", "socket", "sendMessage.js");

  function findMatches(dir, matches, depth) {
    if (depth > 8) return;
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
      console.warn("[patch-fca-runtime] patched sendMessage.js not found at", patchedSrc);
      return;
    }
    if (!fs.existsSync(nodeModulesRoot)) {
      console.warn("[patch-fca-runtime] node_modules not found:", nodeModulesRoot);
      return;
    }

    const matches = [];
    findMatches(nodeModulesRoot, matches, 0);

    const directGuess = path.join(nodeModulesRoot, relSuffix);
    if (fs.existsSync(directGuess) && !matches.includes(directGuess)) {
      matches.push(directGuess);
    }

    if (!matches.length) {
      console.warn("[patch-fca-runtime] No sendMessage.js found under any fca-riyad folder.");
      return;
    }

    for (const target of matches) {
      const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      const patched = fs.readFileSync(patchedSrc, "utf8");
      if (current === patched) {
        console.log("[patch-fca-runtime] Already up to date:", target);
        continue;
      }
      fs.copyFileSync(patchedSrc, target);
      console.log("[patch-fca-runtime] Patched:", target);
    }
    console.log(`[patch-fca-runtime] Done. Checked ${matches.length} file(s) ✅`);
  } catch (e) {
    console.error("[patch-fca-runtime] Failed to apply patch:", e.message);
  }
};
