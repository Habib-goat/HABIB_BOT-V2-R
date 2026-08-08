/**
 * Riyad Bot Framework - Target Resolver
 * -------------------------------------------------------------
 * Works out WHICH user(s) a command like /kick, /adduser, /pp,
 * /addadmin etc. should act on — in BOTH normal Messenger threads
 * AND E2EE (encrypted) threads.
 *
 * Why this exists:
 * - Normal threads: Facebook sends `event.mentions` = { userID: "@Name" }
 *   for every @tag, so resolving a tag is trivial.
 * - E2EE threads: Facebook's encrypted protocol does NOT send mention
 *   metadata at all — only raw text (e.g. "/kick @Saima Sultana").
 *   `event.mentions` is always `{}` there. `api.getThreadInfo()` also
 *   fails for E2EE threads (GraphQL has no data for them), so member
 *   lists must come from whatever is already cached in the DB.
 *
 * Resolution order (first one that finds a match wins):
 *   1. event.mentions            (normal threads — exact, fastest)
 *   2. event.messageReply.senderID (works in BOTH normal & E2EE —
 *                                    replying to someone's message
 *                                    always carries their real ID)
 *   3. Name-matching the raw text against threadInfo.members[].name
 *      (E2EE fallback when no reply is used, best-effort only —
 *      requires the member list to already be cached in the DB from
 *      a normal, non-E2EE interaction in the same group at some point)
 *
 * Usage in a command file:
 *
 *   const resolveTargets = require("../utils/resolveTargets");
 *
 *   onStart: async function ({ api, event, args, threadsData }) {
 *     const threadInfo = await threadsData.getThread(event.threadID).catch(() => ({}));
 *     const botID = api.getCurrentUserID ? api.getCurrentUserID() : "";
 *
 *     const { uids, method } = resolveTargets({ event, args, threadInfo, botID });
 *
 *     if (uids.length === 0) {
 *       return api.sendMessage(
 *         "⚠️ Please tag a member, or reply to their message.",
 *         event.threadID, event.messageID
 *       );
 *     }
 *
 *     // method tells you how it was resolved, useful for debug logs:
 *     // "mentions" | "reply" | "name-match"
 *     for (const uid of uids) {
 *       await api.removeUserFromGroup(uid, event.threadID);
 *     }
 *   }
 */

/**
 * @param {Object} params
 * @param {Object} params.event        The raw event object from the handler.
 * @param {Array}  params.args         event.args (command arguments, text split by space).
 * @param {Object} params.threadInfo   Result of threadsData.getThread(threadID) — must have a
 *                                     `.members` array of { userID, name } for name-matching to work.
 * @param {String} params.botID        The bot's own userID, so it never targets itself by accident.
 * @returns {{ uids: string[], method: string }}
 */
function resolveTargets({ event, args = [], threadInfo = {}, botID = "" }) {
  const { mentions, messageReply } = event || {};

  // 1) Normal threads: real mention metadata, most reliable.
  const mentionIDs = Object.keys(mentions || {}).filter(
    (uid) => String(uid) !== String(botID)
  );
  if (mentionIDs.length > 0) {
    return { uids: mentionIDs, method: "mentions" };
  }

  // 2) Works everywhere, including E2EE: replying to someone's message
  //    always carries their real senderID, encrypted or not.
  if (messageReply && messageReply.senderID) {
    const uid = String(messageReply.senderID);
    if (uid !== String(botID)) {
      return { uids: [uid], method: "reply" };
    }
  }

  // 3) E2EE-only fallback: match the raw tagged name against members
  //    cached in the DB. Best-effort — only as good as the cached list.
  const rawText = (args || []).join(" ").replace(/^@/, "").trim().toLowerCase();
  if (rawText) {
    const members = threadInfo && Array.isArray(threadInfo.members) ? threadInfo.members : [];
    const matched = members.filter(
      (m) => m.name && rawText.includes(String(m.name).toLowerCase()) && String(m.userID) !== String(botID)
    );
    if (matched.length > 0) {
      return { uids: matched.map((m) => String(m.userID)), method: "name-match" };
    }
  }

  return { uids: [], method: "none" };
}

module.exports = resolveTargets;
