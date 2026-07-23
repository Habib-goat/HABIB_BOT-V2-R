const path = require("path");
const StoreLogger = require("./StoreLogger");

class StoreLoader {
  static async loadOrReload(filePath, commandLoader) {
    try {
      const resolvedPath = path.resolve(filePath);
      if (require.cache[resolvedPath]) delete require.cache[resolvedPath];

      const cmdModule = require(resolvedPath);
      const cmdName = cmdModule?.config?.name;

      if (!cmdName) return { success: false, error: "Missing config.name" };

      if (commandLoader) {
        if (typeof commandLoader.reloadCommand === "function") {
          await commandLoader.reloadCommand(cmdName, resolvedPath);
        } else if (typeof commandLoader.loadCommand === "function") {
          await commandLoader.loadCommand(resolvedPath);
        }
      }

      StoreLogger.success(`Loaded/reloaded command: ${cmdName}`);
      return { success: true, name: cmdName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = StoreLoader;