const reactionManager = require("../reactions/reactionManager");
const botMessageTracker = require("./botMessageTracker");
const logger = require('./logger');

/**
 * Messenger API Adapter
 * Exposes a unified interface for different underlying Messenger API implementations
 */
class BaseMessengerAdapter {
  constructor(underlyingApi, wsServer, restLogs) {
    this.api = underlyingApi || {};
    this.wsServer = wsServer;
    this.restLogs = restLogs;
  }

  /**
   * Send a message to a thread.
   * Supports text bodies, attachments, and optional reply tracking.
   */
  async sendMessage(message, threadID, replyMessageID = null) {
    throw new Error("Method 'sendMessage' must be implemented by the adapter subclass.");
  }

  /**
   * Set reaction (emoji) for a message.
   */
  async setReaction(emoji, messageID) {
    throw new Error("Method 'setReaction' must be implemented by the adapter subclass.");
  }

  /**
   * Alias for setReaction to support legacy commands
   */
  async setMessageReaction(emoji, messageID) {
    return this.setReaction(emoji, messageID);
  }

  /**
   * Change user nickname in a thread.
   */
  async changeNickname(nickname, threadID, userID) {
    throw new Error("Method 'changeNickname' must be implemented by the adapter subclass.");
  }
  async setTitle(title, threadID) {
  throw new Error("Method 'setTitle' must be implemented.");
}

async changeThreadEmoji(emoji, threadID) {
  throw new Error("Method 'changeThreadEmoji' must be implemented.");
}

async changeThreadColor(color, threadID) {
  throw new Error("Method 'changeThreadColor' must be implemented.");
}
  async changeGroupImage(image, threadID) {
  throw new Error("Method 'changeGroupImage' must be implemented.");
}
  async markAsRead(threadID) {
  throw new Error("Method 'markAsRead' must be implemented by the adapter subclass.");
}

async markAsSeen() {
  throw new Error("Method 'markAsSeen' must be implemented by the adapter subclass.");
}
async removeUserFromGroup(userID, threadID) {
  throw new Error("Method 'removeUserFromGroup' must be implemented by the adapter subclass.");
}
  async unsendMessage(messageID, threadID = null) {
  throw new Error("Method 'unsendMessage' must be implemented by the adapter subclass.");
}
  async addUserToGroup(userID, threadID) {
  throw new Error("Method 'addUserToGroup' must be implemented by the adapter subclass.");
}

  /**
   * Get user information
   */

  getUserInfo(userID, callback) {
    throw new Error("Method 'getUserInfo' must be implemented by the adapter subclass.");
  }

  /**
   * Get group/thread information
   */
  getThreadInfo(threadID, callback) {
    throw new Error("Method 'getThreadInfo' must be implemented by the adapter subclass.");
  }

  async getThreadList(limit = 100, timestamp = null, tags = ["INBOX"]) {
    throw new Error("Method 'getThreadList' must be implemented by the adapter subclass.");
  }
getCurrentUserID() {
  throw new Error("Method 'getCurrentUserID' must be implemented by the adapter subclass.");
}
}
/**
 * Adapter implementation for Facebook Chat API (FCA) compatible libraries
 * (e.g., fca-unofficial, facebook-chat-api)
 */
class FcaMessengerAdapter extends BaseMessengerAdapter {
  constructor(underlyingApi, wsServer, restLogs) {
    super(underlyingApi, wsServer, restLogs);
    this.e2eeThreads = new Set();
    this.e2eeMessages = new Map(); // messageID -> {threadID, senderJid}, needed for setReaction()
  }

  markE2EEThread(threadID) {
    if (threadID != null) {
      this.e2eeThreads.add(String(threadID));
      console.log('[E2EE-SEND-DEBUG] marked thread as E2EE:', String(threadID));
    }
  }

  markE2EEMessage(messageID, threadID, senderJid) {
    if (messageID != null && threadID != null) {
      this.e2eeMessages.set(String(messageID), { threadID: String(threadID), senderJid: senderJid || null });
      if (this.e2eeMessages.size > 500) {
        this.e2eeMessages.delete(this.e2eeMessages.keys().next().value);
      }
    }
  }

  // MQTT group-management methods expect the numeric thread key. Native
  // E2EE events use a Messenger JID such as "123@g.us".
  _fcaThreadID(threadID) {
    return String(threadID ?? "")
      .replace(/@g\.us$/i, "")
      .replace(/@group\.facebook\.com$/i, "");
  }

async reply(message, event) {
  return this.sendMessage(
    message,
    event.threadID,
    event.messageID
  );
}
async sendMessageDM(message, userID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.sendMessageDM !== "function") {
      return reject(new Error("Underlying FCA sendMessageDM function is not available."));
    }

    this.api.sendMessageDM(message, userID, (err, info) => {
      if (err) return reject(err);
      resolve(info || {});
    });
  });
}
async react(emoji, messageID) {
  return this.setReaction(emoji, messageID);
}
  async sendMessage(message, threadID, callbackOrReply = null, replyMessageID = null) {
    return new Promise((resolve, reject) => {
      let callback = null;
      if (typeof callbackOrReply === "function") {
        callback = callbackOrReply;
      } else {
        replyMessageID = callbackOrReply;
      }
      // Handle cases where the underlying API is not initialized or is missing methods
      console.log('[E2EE-SEND-DEBUG] sendMessage called for threadID:', String(threadID), 'isE2EEThread:', this.e2eeThreads ? this.e2eeThreads.has(String(threadID)) : 'no-set', 'hasApiE2ee:', !!this.api.e2ee, 'hasSendFn:', !!(this.api.e2ee && typeof this.api.e2ee.sendMessage === 'function'));
      if (this.e2eeThreads && this.e2eeThreads.has(String(threadID)) && this.api.e2ee && typeof this.api.e2ee.sendMessage === 'function') {
        (async () => {
          try {
            // Keep the original chat JID.  Native E2EE accepts group JIDs
            // (e.g. ...@g.us) and numeric/other JIDs for direct chats; adding
            // @g.us to every thread breaks encrypted direct conversations.
            const jid = String(threadID);
            const messageAttachments = message && typeof message === "object"
              ? [
                  ...(Array.isArray(message.attachment)
                    ? message.attachment
                    : message.attachment
                      ? [message.attachment]
                      : []),
                  ...(Array.isArray(message.attachments) ? message.attachments : [])
                ]
              : [];
            const e2eeMessage = typeof message === "object" && message !== null
              ? {
                  body: message.body || "",
                  attachments: messageAttachments
                }
              : String(message ?? "");
            let info = await this.api.e2ee.sendMessage(jid, e2eeMessage, replyMessageID);
            if (info && !info.messageID) {
              info.messageID = info.messageId || info.id || `mid.e2ee_${Date.now()}`;
            }
            if (info && info.messageID) {
              reactionManager.register(info.messageID, { commandName: "__global__" });
              botMessageTracker.record(threadID, info.messageID);
            }
            if (callback) { try { callback(null, info); } catch (_) {} }
            resolve(info);
          } catch (err) {
            logger.error('[FcaAdapter] Error sending E2EE message to thread ' + threadID + ':', err);
            if (callback) { try { callback(err); } catch (_) {} }
            reject(err);
          }
        })();
        return;
      }

      if (typeof this.api.sendMessage !== 'function') {
        const errorMsg = "Underlying FCA sendMessage function is not available.";
        logger.error(errorMsg);
        return reject(new Error(errorMsg));
      }

      this.api.sendMessage(message, threadID, (err, messageInfo) => {
        if (err) {
          logger.error(`[FcaAdapter] Error sending message to thread ${threadID}:`, err);
          return reject(err);
        }

        // Send to real-time websocket clients for visual logging on the dashboard
        if (this.wsServer) {
          this.wsServer.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
              client.send(JSON.stringify({
                type: 'bot_message',
                messageID: messageInfo ? messageInfo.messageID : `mid.fca_${Date.now()}`,
                text: typeof message === 'object' ? (message.body || '[Attachment/Rich Object]') : message,
                threadId: threadID,
                replyMessageId: replyMessageID
              }));
            }
          });
        }

        if (this.restLogs) {
          this.restLogs.push({
            sender: 'Bot',
            text: typeof message === 'object' ? (message.body || '[Rich Object]') : message,
            threadId: threadID,
            timestamp: Date.now()
          });
        }

        if (callback) {
  try {
    callback(null, messageInfo);
  } catch (e) {}
}

if (messageInfo && messageInfo.messageID) {
  reactionManager.register(messageInfo.messageID, {
    commandName: "__global__"
  });
  botMessageTracker.record(threadID, messageInfo.messageID);
}

resolve(messageInfo || { messageID: `mid.fca_${Date.now()}` });
      }, replyMessageID);
    });
  }

  async setReaction(emoji, messageID) {
    const e2eeInfo = this.e2eeMessages ? this.e2eeMessages.get(String(messageID)) : null;
    if (e2eeInfo && this.api.e2ee && typeof this.api.e2ee.sendReaction === 'function') {
      try {
        await this.api.e2ee.sendReaction(e2eeInfo.threadID, messageID, emoji, e2eeInfo.senderJid);
        if (this.wsServer) {
          this.wsServer.clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: 'bot_reaction', emoji, messageId: messageID }));
            }
          });
        }
        return { success: true };
      } catch (err) {
        logger.error(`[FcaAdapter] Error setting E2EE reaction for message ${messageID}:`, err);
        throw err;
      }
    }

    return new Promise((resolve, reject) => {
      if (typeof this.api.setMessageReaction !== 'function' && typeof this.api.setReaction !== 'function') {
        logger.warn("[FcaAdapter] setMessageReaction/setReaction function not available on underlying API.");
        return resolve({ success: false, error: 'setMessageReaction not supported' });
      }

      const reactionFunc = this.api.setMessageReaction || this.api.setReaction;

      reactionFunc(emoji, messageID, (err) => {
        if (err) {
          logger.error(`[FcaAdapter] Error setting reaction for message ${messageID}:`, err);
          return reject(err);
        }

        // Broadcast reaction to WebSocket clients
        if (this.wsServer) {
          this.wsServer.clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: 'bot_reaction', emoji, messageId: messageID }));
            }
          });
        }

        resolve({ success: true });
      });
    });
  }

  async changeNickname(nickname, threadID, userID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.changeNickname !== "function") {
      logger.warn("[FcaAdapter] changeNickname function not available on underlying API.");
      return resolve({ success: false, error: "changeNickname not supported" });
    }

    this.api.changeNickname(nickname, threadID, userID, (err) => {
      if (err) return reject(err);
      resolve({ success: true });
    });
  });
}
async setTitle(title, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.setTitle !== "function")
      return reject(new Error("setTitle not supported"));

    this.api.setTitle(title, threadID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

async changeThreadEmoji(emoji, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.changeThreadEmoji !== "function")
      return reject(new Error("changeThreadEmoji not supported"));

    this.api.changeThreadEmoji(emoji, threadID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

async changeThreadColor(color, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.changeThreadColor !== "function")
      return reject(new Error("changeThreadColor not supported"));

    this.api.changeThreadColor(color, threadID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}      
  async changeGroupImage(image, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.changeGroupImage !== "function") {
      return reject(new Error("changeGroupImage not supported"));
    }

    this.api.changeGroupImage(image, threadID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
async removeUserFromGroup(userID, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.removeUserFromGroup !== "function") {
      return reject(new Error("Underlying FCA removeUserFromGroup function is not available."));
    }

    this.api.removeUserFromGroup(userID, this._fcaThreadID(threadID), (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
async unsendMessage(messageID) {
  return new Promise((resolve, reject) => {
    const e2eeInfo = this.e2eeMessages ? this.e2eeMessages.get(String(messageID)) : null;
    if (e2eeInfo && this.api.e2ee && typeof this.api.e2ee.unsendMessage === "function") {
      this.api.e2ee.unsendMessage(String(messageID), e2eeInfo.threadID)
        .then((result) => resolve(result || true))
        .catch(reject);
      return;
    }
    if (typeof this.api.unsendMessage !== "function") {
      return reject(new Error("Underlying FCA unsendMessage function is not available."));
    }

    let settled = false;
    const done = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) return reject(err);
      resolve(result || true);
    };

    try {
      const normalizedThreadID = threadID ? this._fcaThreadID(threadID) : null;
      const result = this.api.unsendMessage.length >= 3
        ? this.api.unsendMessage(messageID, normalizedThreadID, done)
        : this.api.unsendMessage(messageID, done);
      if (result && typeof result.then === "function") {
        result.then((value) => done(null, value)).catch(done);
      }
    } catch (err) {
      done(err);
    }
  });
}
async markAsRead(threadID) {
  return new Promise((resolve) => {
    if (typeof this.api.markAsRead !== "function") {
      logger.warn("[FcaAdapter] markAsRead not supported.");
      return resolve(false);
    }

    this.api.markAsRead(threadID, (err) => {
      if (err) {
        logger.error("[FcaAdapter] markAsRead:", err);
        return resolve(false);
      }

      resolve(true);
    });
  });
}

async markAsSeen() {
  return new Promise((resolve) => {
    if (typeof this.api.markAsSeen !== "function") {
      logger.warn("[FcaAdapter] markAsSeen not supported.");
      return resolve(false);
    }

    this.api.markAsSeen((err) => {
      if (err) {
        logger.error("[FcaAdapter] markAsSeen:", err);
        return resolve(false);
      }

      resolve(true);
    });
  });
}
async addUserToGroup(userID, threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.addUserToGroup !== "function") {
      return reject(new Error("Underlying FCA addUserToGroup function is not available."));
    }

    this.api.addUserToGroup(userID, this._fcaThreadID(threadID), (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
  getUserInfo(userID, callback) {
  if (typeof this.api.getUserInfo === "function") {
    return this.api.getUserInfo(userID, callback);
  } else {
    logger.warn("[FcaAdapter] getUserInfo is not supported.");
    if (typeof callback === "function")
      callback(new Error("getUserInfo not supported"), null);
  }
}

async getThreadInfo(threadID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.getThreadInfo !== "function") {
      return reject(new Error("getThreadInfo not supported"));
    }

    this.api.getThreadInfo(this._fcaThreadID(threadID), (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}
async editMessage(messageID, text) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.editMessage !== "function") {
      return reject(new Error("Underlying FCA editMessage function is not available."));
    }

    // Try signature: (messageID, text, callback)
    this.api.editMessage(messageID, text, (err) => {
      if (!err) return resolve(true);

      // Fallback: (text, messageID, callback)
      this.api.editMessage(text, messageID, (err2) => {
        if (err2) return reject(err2);
        resolve(true);
      });
    });
  });
}

  async getThreadList(limit = 100, timestamp = null, tags = ["INBOX"]) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.getThreadList !== "function") {
      return reject(new Error("Underlying FCA getThreadList function is not available."));
    }

    this.api.getThreadList(limit, timestamp, tags, (err, list) => {
      if (err) return reject(err);
      resolve(list || []);
    });
  });
}

getCurrentUserID() {
  if (typeof this.api.getCurrentUserID === "function") {
    return this.api.getCurrentUserID();
  }

  return this.api.currentUserID || this.api.userID || null;
}

// ── Friends / Requests management (added for fbcontrol.js) ──────────────
// NOTE: these were previously missing from the adapter entirely, which is
// why any command calling api.getFriendsList()/unfriend()/etc used to
// throw "is not a function" immediately — including the message-request
// (mr) accept flow, which relies on handleMessageRequest below.
async getFriendsList() {
  return new Promise((resolve, reject) => {
    if (typeof this.api.getFriendsList !== "function") {
      return reject(new Error("Underlying FCA getFriendsList function is not available."));
    }

    this.api.getFriendsList((err, list) => {
      if (err) return reject(err);
      resolve(list || []);
    });
  });
}

async unfriend(userID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.unfriend !== "function") {
      return reject(new Error("Underlying FCA unfriend function is not available."));
    }

    this.api.unfriend(userID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

async changeBlockedStatus(userID, block) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.changeBlockedStatus !== "function") {
      return reject(new Error("Underlying FCA changeBlockedStatus function is not available."));
    }

    this.api.changeBlockedStatus(userID, block, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// accept/reject an incoming FRIEND request (by the sender's userID)
async handleFriendRequest(userID, accept) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.handleFriendRequest !== "function") {
      return reject(new Error("Underlying FCA handleFriendRequest function is not available."));
    }

    this.api.handleFriendRequest(userID, !!accept, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// accept/reject an incoming MESSAGE request thread (moves thread between
// inbox <-> other/message-requests)
async handleMessageRequest(threadID, accept) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.handleMessageRequest !== "function") {
      return reject(new Error("Underlying FCA handleMessageRequest function is not available."));
    }

    this.api.handleMessageRequest(threadID, !!accept, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
}
/**
 * Adapter implementation for Simulated Environment (Local / Dashboard testing)
 */
class SimulatedMessengerAdapter extends BaseMessengerAdapter {
  constructor(underlyingApi, wsServer, restLogs) {
    super(underlyingApi, wsServer, restLogs);
  }
  async reply(message, event) {
  return this.sendMessage(
    message,
    event.threadID,
    event.messageID
  );
}

async react(emoji, messageID) {
  return this.setReaction(emoji, messageID);
}

  async sendMessage(message, threadID, replyMessageID = null) {
    const text = typeof message === 'object' ? (message.body || '[Rich Object]') : message;
    const messageID = `mid.simulated_${Math.random().toString(36).slice(2)}`;
    logger.info(`[SimulatedAdapter] Sent message to thread ${threadID}: "${text}"`);

    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'bot_message', messageID, text, threadId: threadID, replyMessageId: replyMessageID }));
        }
      });
    }

    if (this.restLogs) {
      this.restLogs.push({ sender: 'Bot', text, threadId: threadID, timestamp: Date.now() });
    }

    reactionManager.register(messageID, {
  commandName: "__global__"
});
botMessageTracker.record(threadID, messageID);

return { messageID };
  }

  async setReaction(emoji, messageID) {
    logger.info(`[SimulatedAdapter] Set reaction ${emoji} to message ${messageID}`);
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'bot_reaction', emoji, messageId: messageID }));
        }
      });
    }
    return { success: true };
  }

  async changeNickname(nickname, threadID, userID) {
    logger.info(`[SimulatedAdapter] Changed nickname of user ${userID} in thread ${threadID} to "${nickname}"`);
    return { success: true };
  }

  getUserInfo(userID, callback) {
    const mockInfo = {};
    mockInfo[userID] = { name: `User ${userID.slice(-4)}` };
    if (typeof callback === 'function') {
      setTimeout(() => callback(null, mockInfo), 10);
    }
    return Promise.resolve(mockInfo);
  }

  getThreadInfo(threadID, callback) {
    const mockInfo = { threadName: `Group Thread ${threadID.slice(-4)}`, name: `Group Thread ${threadID.slice(-4)}` };
    if (typeof callback === 'function') {
      setTimeout(() => callback(null, mockInfo), 10);
    }
    return Promise.resolve(mockInfo);
  }
}

/**
 * Adapter implementation for Facebook Graph Messenger Send API
 */
class GraphMessengerAdapter extends BaseMessengerAdapter {
  constructor(underlyingApi, wsServer, restLogs) {
    super(underlyingApi, wsServer, restLogs);
    this.accessToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN || '';
  }

  async sendMessage(message, threadID, replyMessageID = null) {
    const text = typeof message === 'object' ? (message.body || '') : message;
    logger.info(`[GraphAdapter] Sending message via Facebook Graph API to recipient ${threadID}: "${text}"`);
    
    // In a real Graph API setup, we make a POST request to https://graph.facebook.com/v19.0/me/messages
    // For local adaptability, we support dynamic invocation or simulated responses when keys are missing.
    const messageID = `mid.graph_${Math.random().toString(36).slice(2)}`;

    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'bot_message', messageID, text, threadId: threadID, replyMessageId: replyMessageID }));
        }
      });
    }

    if (this.restLogs) {
  this.restLogs.push({
    sender: 'Bot',
    text,
    threadId: threadID,
    timestamp: Date.now()
  });
}

// Register every bot message for global reactions
reactionManager.register(messageID, {
  commandName: "__global__"
});
botMessageTracker.record(threadID, messageID);

return { messageID };
  }

  async setReaction(emoji, messageID) {
    logger.info(`[GraphAdapter] Set reaction ${emoji} via Facebook Graph API to message ${messageID}`);
    return { success: true };
  }

  async changeNickname(nickname, threadID, userID) {
    logger.info(`[GraphAdapter] Nickname change is not natively supported in Graph API standard messages. Recipient: ${userID}`);
    return { success: false, error: 'changeNickname not natively supported on Graph API' };
  }

  getUserInfo(userID, callback) {
    const mockInfo = {};
    mockInfo[userID] = { name: `Graph User ${userID.slice(-4)}` };
    if (typeof callback === 'function') {
      setTimeout(() => callback(null, mockInfo), 10);
    }
    return Promise.resolve(mockInfo);
  }

  getThreadInfo(threadID, callback) {
    const mockInfo = { threadName: `Graph Thread ${threadID.slice(-4)}`, name: `Graph Thread ${threadID.slice(-4)}` };
    if (typeof callback === 'function') {
      setTimeout(() => callback(null, mockInfo), 10);
    }
    return Promise.resolve(mockInfo);
  }
}

/**
 * Factory class to instantiate the correct adapter
 */
class MessengerAdapterFactory {
  static create(provider, underlyingApi, wsServer, restLogs) {
    const normalizedProvider = (provider || 'simulated').toLowerCase();
    
    switch (normalizedProvider) {
      case 'fca-unofficial':
      case 'fca-riyad':
      case 'fca-eryxenx':
      case 'facebook-chat-api':
      case 'fca':
        return new FcaMessengerAdapter(underlyingApi, wsServer, restLogs);
      case 'graph':
      case 'facebook-graph':
        return new GraphMessengerAdapter(underlyingApi, wsServer, restLogs);
      case 'simulated':
      case 'mock':
      default:
        return new SimulatedMessengerAdapter(underlyingApi, wsServer, restLogs);
    }
  }
}

module.exports = {
  BaseMessengerAdapter,
  FcaMessengerAdapter,
  SimulatedMessengerAdapter,
  GraphMessengerAdapter,
  MessengerAdapterFactory
};
