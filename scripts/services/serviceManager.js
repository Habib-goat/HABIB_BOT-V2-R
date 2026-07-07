/**
 * Riyad Bot Framework - Service Manager
 * Handles background microservices, API integrations, and token-refresh hooks.
 */

const logger = require('../utils/logger');

const services = new Map();

const serviceManager = {
  services,

  register: (name, serviceModule) => {
    services.set(name.toLowerCase(), serviceModule);
    logger.info(`[Service Manager] Registered service: ${name}`);
  },

  get: (name) => {
    return services.get(name.toLowerCase());
  },

  startAll: async () => {
    let count = 0;
    for (const [name, service] of services.entries()) {
      if (typeof service.start === 'function') {
        try {
          await service.start();
          count++;
        } catch (err) {
          logger.error(`Failed to start background service '${name}':`, err);
        }
      }
    }
    logger.success(`Successfully initialized ${count} background integration services.`);
  }
};

module.exports = serviceManager;
