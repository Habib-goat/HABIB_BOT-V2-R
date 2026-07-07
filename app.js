/**
 * RIYAD BOT FRAMEWORK - MAIN APP ENTRY POINT
 * Written in production-grade Node.js (CommonJS)
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs-extra');

// Core framework modules
const logger = require('./scripts/utils/logger');
const database = require('./scripts/utils/database');
const commandLoader = require('./scripts/handlers/commandLoader');
const eventLoader = require('./scripts/handlers/eventLoader');
const pluginManager = require('./scripts/plugins/pluginManager');
const serviceManager = require('./scripts/services/serviceManager');
const scheduler = require('./cron/systemBackup');
const apiRouter = require('./api/routes/api');
const messenger = require('./scripts/utils/messenger');

async function startBot() {
  logger.system("Initializing Riyad Bot Framework...");

  // 1. Create required directories if they don't exist
  fs.ensureDirSync(path.join(__dirname, 'database'));
  fs.ensureDirSync(path.join(__dirname, 'cache'));
  fs.ensureDirSync(path.join(__dirname, 'logs'));
  fs.ensureDirSync(path.join(__dirname, 'assets'));

  // 2. Load all commands & plugins
  logger.info("Loading commands registry...");
  commandLoader.loadAll();

  logger.info("Loading external plug-and-play plugins...");
  pluginManager.loadAll();

  logger.info("Initializing background microservices...");
  await serviceManager.startAll();

  // 3. Load all system events
  logger.info("Loading system events...");
  eventLoader.loadAll();

  // 4. Initialize Express Web Server
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static dashboard interface
  app.use('/', express.static(path.join(__dirname, 'web/dashboard')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web/dashboard/index.html'));
  });

  // Mount API endpoints
  app.use('/api', apiRouter);

  // 5. Initialize WebSocket Server for Real-Time Console Logging
  const wss = new WebSocketServer({ noServer: true });
  app.set('wss', wss); // make accessible in API routes

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    logger.info("Dashboard console client connected via WebSockets.");
    ws.send(JSON.stringify({ type: 'sys', text: "Successfully bridged to Riyad Bot live stream." }));

    ws.on('close', () => {
      logger.info("Dashboard console client disconnected.");
    });
  });

  // 6. Overwrite logger to pipe logs directly to connected WebSockets
  const originalInfo = logger.info;
  const originalSuccess = logger.success;
  const originalWarn = logger.warn;
  const originalError = logger.error;
  const originalSystem = logger.system;

  function broadcastLog(type, text) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedLine = `[${timestamp}] [${type.toUpperCase()}] ${text}`;
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify({ type: 'log', text: formattedLine }));
      }
    });
  }

  logger.info = (msg) => { originalInfo(msg); broadcastLog('info', msg); };
  logger.success = (msg) => { originalSuccess(msg); broadcastLog('success', msg); };
  logger.warn = (msg) => { originalWarn(msg); broadcastLog('warn', msg); };
  logger.error = (msg, err) => { originalError(msg, err); broadcastLog('error', `${msg} ${err ? (err.stack || err.toString()) : ''}`); };
  logger.system = (msg) => { originalSystem(msg); broadcastLog('system', msg); };

  // 7. Initialize background schedulers (cron jobs)
  scheduler.setupScheduler();

  // 8. Start Facebook Messenger Bot Client runtime
  messenger.startMessenger(app, wss);

  // 9. Bind Web Server
  server.listen(PORT, '0.0.0.0', () => {
    logger.success(`Riyad Bot Server running on http://localhost:${PORT}`);
    logger.success(`Webhook verify token configured in config.json: 'riyad_bot_verify_token_2026'`);
    logger.success("Bot has successfully finished boot stage. Waiting for events.");
  });
}

startBot().catch(err => {
  logger.error("FATAL: Bot failed to start:", err);
});
