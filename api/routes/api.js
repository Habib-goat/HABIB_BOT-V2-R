const express = require('express');
const router = express.Router();
const config = require('../../config.json');
const database = require('../../scripts/utils/database');
const commandLoader = require('../../scripts/handlers/commandLoader');
const botEngine = require('../../scripts/middleware/botEngine');
const logger = require('../../scripts/utils/logger');
const fs = require('fs-extra');
const path = require('path');

// Global logs holder for the live API console
const apiLogs = [];

// GET: Bot Status
router.get('/status', (req, res) => {
  const users = Object.keys(database.getAllUsers()).length;
  const threads = Object.keys(database.getAllThreads()).length;
  const totalCommands = commandLoader.commands.size;
  const aliasesCount = commandLoader.aliases.size;

  res.json({
    status: "active",
    botName: config.botName,
    prefix: config.prefix,
    language: config.language,
    databaseType: config.database.type,
    stats: {
      users,
      threads,
      totalCommands,
      aliasesCount,
      executedCommands: database.getSettings().totalCommandsExecuted || 0
    },
    system: {
      uptime: Date.now() - (database.getSettings().systemUptimeStart || Date.now()),
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage()
    }
  });
});

// GET: All Commands
router.get('/commands', (req, res) => {
  const list = [];
  commandLoader.commands.forEach((cmd, name) => {
    list.push({
      name: cmd.config.name,
      aliases: cmd.config.aliases || [],
      version: cmd.config.version || "1.0.0",
      author: cmd.config.author || "Riyad Bot",
      category: cmd.config.category || "general",
      role: cmd.config.role || 0,
      countDown: cmd.config.countDown || 0,
      description: cmd.config.description?.en || cmd.config.description || "No description",
      guide: cmd.config.guide?.en || cmd.config.guide || ""
    });
  });
  res.json(list);
});

// POST: Update Configuration
router.post('/config', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '../../config.json');
    const currentConfig = await fs.readJson(configPath);
    
    // Merge new configs
    const updatedConfig = { ...currentConfig, ...req.body };
    await fs.writeJson(configPath, updatedConfig, { spaces: 2 });
    
    // Reload local config cache if needed
    res.json({ success: true, message: "Configuration updated successfully.", config: updatedConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET: System Logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await logger.getLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST: Clear Logs
router.post('/clear-logs', async (req, res) => {
  try {
    await logger.clearLogs();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST: Simulate Messenger Event (Interactive Testing Engine)
router.post('/simulate', async (req, res) => {
  const { senderID, senderName, threadID, body, isGroupAdmin, messageReply, reaction } = req.body;
  
  if (!senderID || !threadID) {
    return res.status(400).json({ error: "Missing senderID or threadID fields." });
  }

  const simulatedEvent = {
    senderID: senderID.toString(),
    senderName: senderName || "Interactive Tester",
    threadID: threadID.toString(),
    body: body ? body.toString() : '',
    messageID: req.body.messageID || `mid.simulated_${Math.random().toString(36).slice(2)}`,
    isGroupAdmin: !!isGroupAdmin,
    messageReply: messageReply || null,
    reaction: reaction || null,
    timestamp: Date.now()
  };

  const results = [];
  logger.info(`[Interactive Simulator] Event received: "${body}" from ${senderName} (${senderID})`);

  try {
    // Process through Bot Core
    const eventLoader = require('../../scripts/handlers/eventLoader');
    await botEngine.processMessage(simulatedEvent, commandLoader, eventLoader, req.app.get('wss'), results);
    res.json({ success: true, event: simulatedEvent, responses: results });
  } catch (err) {
    logger.error("Simulation Execution Failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// FB Messenger Real-time Webhook Setup
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === config.webhookVerifyToken) {
      logger.success('FB WEBHOOK VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

router.post('/webhook', (req, res) => {
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && event.message.text) {
          // Process message event
          const formattedEvent = {
            senderID: event.sender.id,
            threadID: event.recipient.id, // Group chats or direct messages
            body: event.message.text,
            messageID: event.message.mid,
            timestamp: event.timestamp
          };
          
          const eventLoader = require('../../scripts/handlers/eventLoader');
          botEngine.processMessage(formattedEvent, commandLoader, eventLoader, req.app.get('wss'), null)
            .catch(err => logger.error("Webhook processing error:", err));
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;
