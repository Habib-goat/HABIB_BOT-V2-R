const os = require('os');
const moment = require('moment-timezone');
const config = require('../../config.json');

const startTime = Date.now();

module.exports = {
  config: {
    name: "uptime",
    aliases: ["status", "stats", "system"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 0,
    category: "system",
    guide: {
      en: "{pn}"
    },
    description: {
      en: "View advanced system statistics and bot running time."
    }
  },

  onStart: async function({ api, event, message, usersData, threadsData }) {
    const uptimeMs = Date.now() - startTime;
    const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);
    
    const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    // Commands and users info
    const commandLoader = require('../handlers/commandLoader');
    const totalUsers = Object.keys(usersData.getAllUsers()).length;
    const totalThreads = Object.keys(threadsData.getAllThreads()).length;

    // RAM stats
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / 1024 / 1024).toFixed(1) + ' MB / ' + (totalMemory / 1024 / 1024).toFixed(0) + ' MB';

    // CPU Stats
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'N/A';
    const cpuCores = cpus.length;

    let response = `╔══════════════════╗
║ ⚡ ${config.botName.toUpperCase()} 𝐒𝐘𝐒𝐓𝐄𝐌 ⚡
║     『 𝐔𝐏𝐓𝐈𝐌𝐄 ⚜️ 𝐋𝐈𝐕𝐄 』
╠══════════════════╣
║ ⏱️ 𝐔𝐏𝐓𝐈𝐌𝐄   : ${uptimeStr}
║ 📁 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 : ${commandLoader.commands.size} Active
║ 🔀 𝐀𝐋𝐈𝐀𝐒𝐄𝐒  : ${commandLoader.aliases.size}
║ 👥 𝐔𝐒𝐄𝐑𝐒    : ${totalUsers}
║ 👨‍👩‍👧‍👦 𝐆𝐑𝐎𝐔𝐏𝐒   : ${totalThreads}
╠══════════════════╣
║ 💾 𝐌𝐄𝐌𝐎𝐑𝐘   : ${(usedMemory / 1024 / 1024).toFixed(1)} MB
║ 📦 𝐓𝐎𝐓𝐀𝐋    : ${(totalMemory / 1024 / 1024).toFixed(0)} MB
║ ⚡ 𝐍𝐎𝐃𝐄.𝐉𝐒  : ${process.version}
║ 🖥️ 𝐂𝐏𝐔      : ${cpuCores}x ${cpuModel}
║ 🛡️ 𝐏𝐋𝐀𝐓𝐅𝐎𝐑𝐌 : ${os.platform()} (${os.arch()})
╠══════════════════╣
║ 🟢𝐒𝐘𝐒𝐓𝐄𝐌 • 𝐎𝐍𝐋𝐈𝐍𝐄🟢
╚══════════════════╝`;
    await api.sendMessage(response, event.threadID);
  }
};
