/**
 * Riyad Bot Framework - Plugin Manager
 * Manages external third-party plug-and-play packages and scripts.
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const pluginsDir = path.join(__dirname, '../plugins');
fs.ensureDirSync(pluginsDir);

const pluginManager = {
  plugins: new Map(),

  /**
   * Load all plugins in the plugins directory
   */
  loadAll: () => {
    pluginManager.plugins.clear();
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    let count = 0;

    for (const file of files) {
      const filePath = path.join(pluginsDir, file);
      try {
        delete require.cache[require.resolve(filePath)];
        const plugin = require(filePath);
        
        if (!plugin.config || !plugin.config.name) {
          logger.warn(`Skipping invalid plugin file: ${file} - Missing config`);
          continue;
        }

        pluginManager.plugins.set(plugin.config.name.toLowerCase(), {
          ...plugin,
          filePath
        });
        count++;
      } catch (err) {
        logger.error(`Failed to load plugin ${file}:`, err);
      }
    }
    logger.success(`Loaded ${count} active external plugins.`);
    return count;
  }
};

module.exports = pluginManager;
