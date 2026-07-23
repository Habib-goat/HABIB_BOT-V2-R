class StoreLogger {
  static info(msg) { console.log(`[INFO] ${msg}`); }
  static warn(msg) { console.warn(`[WARN] ${msg}`); }
  static error(msg, err) { console.error(`[ERROR] ${msg}`, err || ""); }
  static sync(msg) { console.log(`[SYNC] ${msg}`); }
  static success(msg) { console.log(`[SUCCESS] ${msg}`); }
}
module.exports = StoreLogger;