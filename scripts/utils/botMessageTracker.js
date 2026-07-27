/**
 * Riyad Bot Framework - Bot Message Tracker
 *
 * The messenger adapter (scripts/utils/messengerAdapter.js) does not expose
 * getThreadHistory, and Facebook's unofficial APIs don't reliably support it
 * either. So instead of trying to fetch thread history, we simply record the
 * messageID of every message the bot sends, per thread, in memory. Commands
 * like `clear` can then unsend exactly those tracked messages.
 */

const MAX_PER_THREAD = 200; // cap memory usage per thread
const MAX_AGE_MS = 60 * 60 * 1000; // drop anything older than 1 hour

const store = new Map(); // threadID (string) -> array of { messageID, timestamp }

function record(threadID, messageID) {
  if (!threadID || !messageID) return;
  const key = String(threadID);

  if (!store.has(key)) store.set(key, []);
  const list = store.get(key);

  list.push({ messageID: String(messageID), timestamp: Date.now() });

  if (list.length > MAX_PER_THREAD) {
    list.splice(0, list.length - MAX_PER_THREAD);
  }
}

function getForThread(threadID) {
  const key = String(threadID);
  const list = store.get(key) || [];
  const cutoff = Date.now() - MAX_AGE_MS;
  return list.filter(m => m.timestamp >= cutoff);
}

function remove(threadID, messageID) {
  const key = String(threadID);
  const list = store.get(key);
  if (!list) return;
  const idx = list.findIndex(m => m.messageID === String(messageID));
  if (idx !== -1) list.splice(idx, 1);
}

function clearThread(threadID) {
  store.delete(String(threadID));
}

// Periodic cleanup so memory doesn't grow unbounded on long-running processes.
setInterval(() => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [key, list] of store) {
    const fresh = list.filter(m => m.timestamp >= cutoff);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}, 10 * 60 * 1000);

module.exports = { record, getForThread, remove, clearThread };
