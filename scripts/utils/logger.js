const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

const logDir = path.join(__dirname, '../../logs');
const logFile = path.join(logDir, 'bot.log');

// Ensure log directory exists
fs.ensureDirSync(logDir);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",
  
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m"
};

function writeLogToFile(level, message) {
  const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
  const logLine = `[${timestamp}] [${level.toUpperCase()}]: ${message}\n`;
  fs.appendFileSync(logFile, logLine);
}

const logger = {
  info: (msg) => {
    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    console.log(`${colors.fgCyan}[${timestamp}] [INFO]${colors.reset} ${msg}`);
    writeLogToFile('info', msg);
  },
  
  success: (msg) => {
    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    console.log(`${colors.fgGreen}[${timestamp}] [SUCCESS]${colors.reset} ${msg}`);
    writeLogToFile('success', msg);
  },
  
  warn: (msg) => {
    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    console.log(`${colors.fgYellow}[${timestamp}] [WARN]${colors.reset} ${msg}`);
    writeLogToFile('warn', msg);
  },
  
  error: (msg, err = '') => {
    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    console.log(`${colors.fgRed}[${timestamp}] [ERROR]${colors.reset} ${msg}`, err);
    writeLogToFile('error', `${msg} ${err ? (err.stack || err.toString()) : ''}`);
  },
  
  system: (msg) => {
    const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    console.log(`${colors.fgMagenta}[${timestamp}] [SYSTEM]${colors.reset} ${msg}`);
    writeLogToFile('system', msg);
  },

  getLogs: async () => {
    if (await fs.pathExists(logFile)) {
      const content = await fs.readFile(logFile, 'utf8');
      return content.split('\n').filter(Boolean).slice(-100); // return last 100 lines
    }
    return [];
  },

  clearLogs: async () => {
    await fs.remove(logFile);
    await fs.ensureFile(logFile);
  }
};

module.exports = logger;
