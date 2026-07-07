const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../scripts/utils/logger');
const database = require('../scripts/utils/database');

function setupScheduler() {
  // 1. Cron Job: Database Backup every day at midnight (0 0 * * *)
  // For interactive testing, we can also write logs indicating it is active.
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.system("Starting scheduled database backup job...");
      
      const dbDir = path.join(__dirname, '../database');
      const backupDir = path.join(dbDir, 'backups');
      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}`);
      await fs.ensureDir(backupPath);

      // Copy json files
      await fs.copy(path.join(dbDir, 'users.json'), path.join(backupPath, 'users.json'));
      await fs.copy(path.join(dbDir, 'threads.json'), path.join(backupPath, 'threads.json'));
      await fs.copy(path.join(dbDir, 'settings.json'), path.join(backupPath, 'settings.json'));

      logger.success(`Scheduled backup successfully created at ${backupPath}`);
    } catch (err) {
      logger.error("Failed to run scheduled database backup:", err);
    }
  });

  // 2. Cron Job: Cache Cleanup every hour (0 * * * *)
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info("Executing scheduled hourly cache cleanup task...");
      const cacheDir = path.join(__dirname, '../cache');
      await fs.ensureDir(cacheDir);
      
      const files = await fs.readdir(cacheDir);
      for (const file of files) {
        // Clear all temporary files except system dots
        if (!file.startsWith('.')) {
          await fs.remove(path.join(cacheDir, file));
        }
      }
      logger.success("Scheduled hourly cache cleanup finished successfully.");
    } catch (err) {
      logger.error("Scheduled cache cleanup failed:", err);
    }
  });

  // 3. Cron Job: Clean Expired Replies and Reactions listeners every 15 minutes (*/15 * * * *)
  cron.schedule('*/15 * * * *', () => {
    try {
      const replyManager = require('../scripts/replies/replyManager');
      const reactionManager = require('../scripts/reactions/reactionManager');
      replyManager.cleanExpired();
      reactionManager.cleanExpired();
    } catch (err) {
      logger.error("Failed to prune expired reply/reaction listeners:", err);
    }
  });

  logger.success("Background Schedulers (Cron Jobs) initialized successfully.");
}

module.exports = { setupScheduler };
