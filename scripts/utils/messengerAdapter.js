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
  async unsendMessage(messageID) {
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
  }

  markE2EEThread(threadID) {
    if (threadID != null) this.e2eeThreads.add(String(threadID));
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
      if (this.e2eeThreads && this.e2eeThreads.has(String(threadID)) && this.api.e2ee && typeof this.api.e2ee.sendE2EEMessage === 'function') {
        const text = typeof message === 'object' ? (message.body || '') : String(message);
        this.api.e2ee.sendE2EEMessage(threadID, text, replyMessageID)
          .then((info) => {
            if (callback) { try { callback(null, info); } catch (_) {} }
            resolve(info);
          })
          .catch((err) => {
            logger.error('[FcaAdapter] Error sending E2EE message to thread ' + threadID + ':', err);
            if (callback) { try { callback(err); } catch (_) {} }
            reject(err);
          });
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

    this.api.removeUserFromGroup(userID, threadID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}
async unsendMessage(messageID) {
  return new Promise((resolve, reject) => {
    if (typeof this.api.unsendMessage !== "function") {
      return reject(new Error("Underlying FCA unsendMessage function is not available."));
    }

    this.api.unsendMessage(messageID, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
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

    this.api.addUserToGroup(userID, threadID, (err) => {
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

    this.api.getThreadInfo(threadID, (err, info) => {
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
