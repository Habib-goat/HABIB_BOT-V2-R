/**
 * Riyad Bot Framework - Bot API Controller
 */

const database = require('../scripts/utils/database');
const commandLoader = require('../scripts/handlers/commandLoader');
const config = require('../config.json');

const botController = {
  getStats: (req, res) => {
    const users = Object.keys(database.getAllUsers()).length;
    const threads = Object.keys(database.getAllThreads()).length;
    
    res.json({
      success: true,
      botName: config.botName,
      usersCount: users,
      threadsCount: threads,
      commandsCount: commandLoader.commands.size,
      uptime: Date.now() - (database.getSettings().systemUptimeStart || Date.now())
    });
  },

  getCommandsList: (req, res) => {
    const list = Array.from(commandLoader.commands.values()).map(cmd => ({
      name: cmd.config.name,
      category: cmd.config.category,
      role: cmd.config.role,
      description: cmd.config.description
    }));
    res.json({ success: true, count: list.length, commands: list });
  }
};

module.exports = botController;
