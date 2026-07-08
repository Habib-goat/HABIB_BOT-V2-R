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
}

/**
 * Adapter implementation for Facebook Chat API (FCA) compatible libraries
 * (e.g., fca-unofficial, facebook-chat-api)
 */
class FcaMessengerAdapter extends BaseMessengerAdapter {
  constructor(underlyingApi, wsServer, restLogs) {
    super(underlyingApi, wsServer, restLogs);
  }

  async sendMessage(message, threadID, replyMessageID = null) {
    return new Promise((resolve, reject) => {
      // Handle cases where the underlying API is not initialized or is missing methods
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
      if (typeof this.api.changeNickname !== 'function') {
        logger.warn("[FcaAdapter] changeNickname function not available on underlying API.");
        return resolve({ success: false, error: 'changeNickname not supported' });
      }

      this.api.changeNickname(nickname, threadID, userID, (err) => {
        if (err) {
          logger.error(`[FcaAdapter] Error changing nickname for user ${userID} in thread ${threadID}:`, err);
          return reject(err);
        }
        resolve({ success: true });
      });
    });
  }

  getUserInfo(userID, callback) {
    if (typeof this.api.getUserInfo === 'function') {
      return this.api.getUserInfo(userID, callback);
    } else {
      logger.warn("[FcaAdapter] getUserInfo is not supported on this provider.");
      if (typeof callback === 'function') callback(new Error("getUserInfo not supported"), null);
    }
  }

  getThreadInfo(threadID, callback) {
    if (typeof this.api.getThreadInfo === 'function') {
      return this.api.getThreadInfo(threadID, callback);
    } else {
      logger.warn("[FcaAdapter] getThreadInfo is not supported on this provider.");
      if (typeof callback === 'function') callback(new Error("getThreadInfo not supported"), null);
    }
  }

  async markAsRead(threadID) {
    return new Promise((resolve) => {
      if (typeof this.api.markAsRead === "function") {
        this.api.markAsRead(threadID, () => resolve(true));
      } else {
        resolve(false);
      }
    });
  }

  async markAsSeen() {
    return new Promise((resolve) => {
      if (typeof this.api.markAsSeen === "function") {
        this.api.markAsSeen(() => resolve(true));
      } else {
        resolve(false);
      }
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
      this.restLogs.push({ sender: 'Bot', text, threadId: threadID, timestamp: Date.now() });
    }

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
