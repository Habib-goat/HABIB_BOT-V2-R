const config = require('../../config.json');

module.exports = {
  config: {
    name: "help",
    aliases: ["menu", "commands", "cmds"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 3,
    role: 0,
    category: "system",
    guide: {
      en: "{pn} or {pn} [commandName]"
    },
    description: {
      en: "Show all commands or get guides for a specific command."
    }
  },

  onStart: async function({ api, event, args, message, usersData, threadsData }) {
    const threadID = event.threadID;
    const prefix = config.prefix;
    
    // Command Loader map is accessed from a global registry or passed in
    const commandLoader = require('../handlers/commandLoader');
    const { commands } = commandLoader;

    if (args.length === 0) {
      // Group commands by category
      const categories = {};
      for (const [name, cmd] of commands.entries()) {
        const cat = cmd.config.category || 'general';
        if (!categories[cat]) categories[cat] = [];
        // Add unique commands (exclude aliases)
        if (!categories[cat].includes(name)) {
          categories[cat].push(name);
        }
      }

      let responseText = `📂 ━━━━ [ ${config.botName.toUpperCase()} MENU ] ━━━━ 📂\n`;
      responseText += `✨ Prefix: '${prefix}' | Commands: ${commands.size}\n\n`;

      for (const [category, cmdsList] of Object.entries(categories)) {
        responseText += `📁 [ ${category.toUpperCase()} ]\n`;
        responseText += `  » ${cmdsList.sort().join(', ')}\n\n`;
      }

      responseText += `💡 Type '${prefix}help [command]' to get instructions for a specific tool.`;
      await api.sendMessage(responseText, threadID);
    } else {
      const query = args[0].toLowerCase();
      let cmd = commands.get(query);
      
      // Check aliases if not found directly
      if (!cmd && commandLoader.aliases.has(query)) {
        const realName = commandLoader.aliases.get(query);
        cmd = commands.get(realName);
      }

      if (!cmd) {
        await api.sendMessage(`❌ Command '${query}' not found. Type '${prefix}help' for the full list.`, threadID);
        return;
      }

      const roleNames = ["Everyone", "Group Admin", "Bot Admin", "Bot Owner"];
      let helpText = `🛠️ COMMAND INFORMATION: ${cmd.config.name.toUpperCase()}\n`;
      helpText += `━━━━━━━━━━━━━━━━━━━━━\n`;
      helpText += `📝 Description: ${cmd.config.description?.en || cmd.config.description || 'No description'}\n`;
      helpText += `📂 Category: ${cmd.config.category || 'general'}\n`;
      helpText += `🔑 Permission: ${roleNames[cmd.config.role || 0]} (Level ${cmd.config.role || 0})\n`;
      helpText += `⏳ Cooldown: ${cmd.config.countDown || 0}s\n`;
      
      if (cmd.config.aliases && cmd.config.aliases.length > 0) {
        helpText += `🔗 Aliases: ${cmd.config.aliases.join(', ')}\n`;
      }

      const guideStr = cmd.config.guide?.en || cmd.config.guide || '{pn}';
      helpText += `💡 Guide: ${guideStr.replace(/{pn}/g, prefix + cmd.config.name)}\n`;
      helpText += `━━━━━━━━━━━━━━━━━━━━━`;

      await api.sendMessage(helpText, threadID);
    }
  }
};
