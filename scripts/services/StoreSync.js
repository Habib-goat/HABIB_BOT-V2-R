const fs = require("fs");
const path = require("path");
const { hashContent } = require("../utils/hash");
const { atomicWriteFileSync } = require("../utils/atomicWrite");
const StoreUploader = require("./StoreUploader");
const StoreValidator = require("./StoreValidator");
const StoreLogger = require("./StoreLogger");

const DB_PATH = path.join(process.cwd(), "scripts", "database", "storeSync.json");
const CMDS_DIR = path.join(process.cwd(), "scripts", "cmds");

// Small gap between uploads so a big batch doesn't burst straight into the
// store API's rate limiter (50 actions / 5 min = safely under 1 every ~1.2s).
const UPLOAD_GAP_MS = 1200;

class StoreSync {
  static _running = false;

  static loadSyncDb() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, "utf8");
        return JSON.parse(raw) || { synced: {} };
      }
    } catch (err) {
      StoreLogger.warn("Could not read storeSync.json, initializing fresh DB.", err);
    }
    return { synced: {} };
  }

  static saveSyncDb(db) {
    try {
      atomicWriteFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (err) {
      StoreLogger.error("Failed to save storeSync.json", err);
    }
  }

  // Dry run: figure out which cmds files actually changed since last sync,
  // without uploading anything. Used to build the "are you sure?" confirm
  // card before touching the store API at all.
  static getPendingChanges() {
    if (!fs.existsSync(CMDS_DIR)) return [];
    const db = this.loadSyncDb();
    if (!db.synced) db.synced = {};

    const files = fs.readdirSync(CMDS_DIR).filter(f => f.endsWith(".js"));
    const pending = [];

    for (const file of files) {
      const filePath = path.join(CMDS_DIR, file);
      let content;
      try { content = fs.readFileSync(filePath, "utf8"); } catch (_) { continue; }

      const fileHash = hashContent(content);
      if (db.synced[file] === fileHash) continue;

      const val = StoreValidator.validate(content);
      if (!val.valid) continue; // surfaced separately if needed, not as a "pending change"

      const meta = require("../utils/parser").parseCommandMetadata(content) || {};
      pending.push({ file, version: meta.version || "1.0.0", isNew: !db.synced[file] });
    }
    return pending;
  }

  // Sync everything that changed. Pass `onlyFiles` (array of filenames) to
  // restrict the run to a specific set — used after the user confirms the
  // "replace?" prompt instead of blindly re-pushing the whole cmds folder.
  static async syncAll(onProgress = null, onlyFiles = null) {
    if (this._running) {
      return { syncedCount: 0, skippedCount: 0, failedFiles: [], busy: true };
    }
    this._running = true;

    try {
      if (!fs.existsSync(CMDS_DIR)) {
        try { fs.mkdirSync(CMDS_DIR, { recursive: true }); } catch (_) {}
        return { syncedCount: 0, skippedCount: 0, failedFiles: [] };
      }

      const db = this.loadSyncDb();
      if (!db.synced) db.synced = {};

      let files = fs.readdirSync(CMDS_DIR).filter(f => f.endsWith(".js"));
      if (Array.isArray(onlyFiles)) {
        const allow = new Set(onlyFiles);
        files = files.filter(f => allow.has(f));
      }

      let syncedCount = 0;
      let skippedCount = 0;
      const failedFiles = [];
      let processedCount = 0;

      const withFileTimeout = (promise, ms) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`File processing timed out after ${ms / 1000}s`)), ms))
        ]);
      };

      for (const file of files) {
        processedCount++;
        if (typeof onProgress === "function") {
          try { onProgress(processedCount, files.length, file); } catch (_) {}
        }

        try {
          await withFileTimeout((async () => {
            const filePath = path.join(CMDS_DIR, file);
            let content;
            try { content = fs.readFileSync(filePath, "utf8"); } catch (_) { return; }

            const fileHash = hashContent(content);
            if (db.synced[file] === fileHash) {
              skippedCount++;
              return;
            }

            const val = StoreValidator.validate(content);
            if (!val.valid) {
              failedFiles.push({ file, reason: val.error || "Validation failed" });
              return;
            }

            const uploadRes = await StoreUploader.upload(content, file);
            if (uploadRes.success) {
              db.synced[file] = fileHash;
              syncedCount++;
            } else {
              // Leave it out of db.synced on purpose — it'll simply be
              // picked up again on the next sync instead of being lost.
              failedFiles.push({ file, reason: uploadRes.error || "Upload failed" });
            }
          })(), 25000);
        } catch (timeoutErr) {
          failedFiles.push({ file, reason: timeoutErr.message });
        }

        // Pace uploads so a big batch doesn't burst into the rate limiter.
        if (processedCount < files.length) {
          await new Promise(r => setTimeout(r, UPLOAD_GAP_MS));
        }
      }

      if (syncedCount > 0) this.saveSyncDb(db);
      return { syncedCount, skippedCount, failedFiles };
    } finally {
      this._running = false;
    }
  }
}

module.exports = StoreSync;
