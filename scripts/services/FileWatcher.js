const fs = require("fs");
const path = require("path");
const StoreSync = require("./StoreSync");

class FileWatcher {
  start() {
    const dir = path.join(process.cwd(), "scripts", "cmds");
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    try {
      fs.watch(dir, (evt, fn) => {
        if (fn && fn.endsWith(".js")) StoreSync.syncAll().catch(() => {});
      });
      this.isWatching = true;
    } catch (_) {}
  }
}
module.exports = new FileWatcher();
