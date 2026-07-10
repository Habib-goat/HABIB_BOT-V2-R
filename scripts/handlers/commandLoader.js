const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const cmdsDir = path.join(__dirname, '../cmds');

// Global command and alias register
const commands = new Map();
const aliases = new Map();

// Helper to recursively list files
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

const commandLoader = {
  commands,
  aliases,

  loadAll: () => {
    commands.clear();
    aliases.clear();
    
    fs.ensureDirSync(cmdsDir);
    const files = getFiles(cmdsDir);
    let count = 0;

    for (const file of files) {
      try {
        // Clear require cache for hot loading
        delete require.cache[require.resolve(file)];
        const exported = require(file);

        // Standardize exported to always be an array
        const cmdsToRegister = Array.isArray(exported) ? exported : [exported];

        for (const cmd of cmdsToRegister) {
          if (!cmd || !cmd.config || !cmd.config.name) {
            logger.warn(`Skipping invalid command in file: ${path.relative(cmdsDir, file)} - Missing config or config.name`);
            continue;
          }

          const cmdName = cmd.config.name.toLowerCase();
          commands.set(cmdName, {
  ...cmd,
  filePath: file
});

console.log("LOADED COMMAND:", cmdName);
          // Register aliases if present
          if (cmd.config.aliases && Array.isArray(cmd.config.aliases)) {
            for (const alias of cmd.config.aliases) {
              aliases.set(alias.toLowerCase(), cmdName);
            }
          }

          count++;
        }
      } catch (err) {
  logger.error(`Failed to load command file ${path.relative(cmdsDir, file)}:`, err);
  console.log("FAILED FILE:", file);
  console.log(err);
}
    }

    logger.success(`Loaded ${count} commands with ${aliases.size} aliases.`);
    return count;
  },

  reloadCommand: (commandName) => {
    const cmdName = commandName.toLowerCase();
    let targetCmd = commands.get(cmdName);

    // If not found directly, check aliases
    if (!targetCmd && aliases.has(cmdName)) {
      const actualName = aliases.get(cmdName);
      targetCmd = commands.get(actualName);
    }

    if (!targetCmd) {
      throw new Error(`Command '${commandName}' is not loaded or does not exist.`);
    }

    const filePath = targetCmd.filePath;
    try {
      delete require.cache[require.resolve(filePath)];
      const exported = require(filePath);

      const cmdsToRegister = Array.isArray(exported) ? exported : [exported];

      // Verify all elements in the array are valid
      for (const cmd of cmdsToRegister) {
        if (!cmd || !cmd.config || !cmd.config.name) {
          throw new Error("Missing config or config.name in the reloaded command file.");
        }
      }

      // Remove all old commands and aliases associated with this filePath
      for (const [name, existingCmd] of commands.entries()) {
        if (existingCmd.filePath === filePath) {
          commands.delete(name);
        }
      }
      for (const [alias, mappedName] of aliases.entries()) {
        const existingCmd = commands.get(mappedName);
        if (!existingCmd || existingCmd.filePath === filePath) {
          aliases.delete(alias);
        }
      }

      // Register new ones
      for (const cmd of cmdsToRegister) {
        const newCmdName = cmd.config.name.toLowerCase();
        commands.set(newCmdName, {
          ...cmd,
          filePath
        });

        if (cmd.config.aliases && Array.isArray(cmd.config.aliases)) {
          for (const alias of cmd.config.aliases) {
            aliases.set(alias.toLowerCase(), newCmdName);
          }
        }
      }

      logger.info(`Reloaded command file: ${path.relative(cmdsDir, filePath)}`);
      return true;
    } catch (err) {
      logger.error(`Error reloading command '${commandName}':`, err);
      throw err;
    }
  }
};

module.exports = commandLoader;
