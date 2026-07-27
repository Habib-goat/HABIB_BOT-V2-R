const fs = require("fs");
const path = require("path");
const { hashContent } = require("../utils/hash");
const { atomicWriteFileSync } = require("../utils/atomicWrite");
const StoreUploader = require("./StoreUploader");
const StoreValidator = require("./StoreValidator");
const StoreLogger = require("./StoreLogger");

const DB_PATH = path.join(process.cwd(), "scripts", "database", "storeSync.json");
const CMDS_DIR = path.join(process.cwd(), "scripts", "cmds");

class StoreSync {
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

  static async syncAll(onProgress = null) {
    if (!fs.existsSync(CMDS_DIR)) {
      try { fs.mkdirSync(CMDS_DIR, { recursive: true }); } catch (_) {}
      return { syncedCount: 0, skippedCount: 0, failedFiles: [] };
    }

    const db = this.loadSyncDb();
    if (!db.synced) db.synced = {};

    const files = fs.readdirSync(CMDS_DIR).filter(f => f.endsWith(".js"));
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
            failedFiles.push({ file, reason: uploadRes.error || "Upload failed" });
          }
        })(), 25000);
      } catch (timeoutErr) {
        failedFiles.push({ file, reason: timeoutErr.message });
      }
    }

    if (syncedCount > 0) this.saveSyncDb(db);
    return { syncedCount, skippedCount, failedFiles };
  }
}

module.exports = StoreSync;
