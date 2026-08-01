const fs = require("fs");
const path = require("path");
const StoreSync = require("./StoreSync");

// How long to wait after the LAST file-change event before actually syncing.
// fs.watch fires multiple events per save (and floods on bulk changes like a
// git pull), so without this every one of those events used to fire its own
// full syncAll() — many overlapping uploads at once is exactly what triggers
// the store API's 429s.
const DEBOUNCE_MS = 3000;

class FileWatcher {
  constructor() {
    this._debounceTimer = null;
    this._syncRunning = false;
    this._syncQueued = false;
  }

  _runSync() {
    if (this._syncRunning) {
      // A sync is already in flight — just remember to run once more
      // when it finishes, instead of starting a second one in parallel.
      this._syncQueued = true;
      return;
    }
    this._syncRunning = true;
    StoreSync.syncAll()
      .catch(() => {})
      .finally(() => {
        this._syncRunning = false;
        if (this._syncQueued) {
          this._syncQueued = false;
          this._runSync();
        }
      });
  }

  start() {
    const dir = path.join(process.cwd(), "scripts", "cmds");
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    try {
      fs.watch(dir, (evt, fn) => {
        if (!fn || !fn.endsWith(".js")) return;
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._runSync(), DEBOUNCE_MS);
      });
      this.isWatching = true;
    } catch (_) {}
  }
}
module.exports = new FileWatcher();
