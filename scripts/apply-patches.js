// Copies our fixed fca-riyad sendMessage.js into node_modules after every
// npm install, since Railway reinstalls dependencies fresh on each deploy
// and would otherwise overwrite our fix.
const fs = require("fs");
const path = require("path");

const patched = path.join(__dirname, "..", "patches", "sendMessage.js");
const target = path.join(
  __dirname, "..", "node_modules", "fca-riyad", "src", "api", "socket", "sendMessage.js"
);

try {
  if (!fs.existsSync(patched)) {
    console.warn("[patch-fca] patched sendMessage.js not found at", patched);
    process.exit(0);
  }
  if (!fs.existsSync(path.dirname(target))) {
    console.warn("[patch-fca] target dir not found, skipping (fca-riyad path may differ):", target);
    process.exit(0);
  }
  fs.copyFileSync(patched, target);
  console.log("[patch-fca] Patched sendMessage.js applied to node_modules/fca-riyad ✅");
} catch (e) {
  console.error("[patch-fca] Failed to apply patch:", e.message);
}
