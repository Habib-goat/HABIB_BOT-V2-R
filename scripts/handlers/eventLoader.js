const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const eventsDir = path.join(__dirname, '../events');
const events = new Map();

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const eventLoader = {
  events,

  loadAll: () => {
    events.clear();
    fs.ensureDirSync(eventsDir);
    const files = getFiles(eventsDir);
    let count = 0;

    for (const file of files) {
      try {
        delete require.cache[require.resolve(file)];
        const eventModule = require(file);

        if (!eventModule.config || !eventModule.config.name) {
          logger.warn(`Skipping invalid event file: ${path.relative(eventsDir, file)} - Missing config or name`);
          continue;
        }

        const eventName = eventModule.config.name.toLowerCase();
        events.set(eventName, {
          ...eventModule,
          filePath: file
        });

        count++;
      } catch (err) {
        logger.error(`Failed to load event file ${path.relative(eventsDir, file)}:`, err);
      }
    }

    logger.success(`Loaded ${count} system events.`);
    return count;
  }
};

module.exports = eventLoader;
