# 🤖 Riyad Bot Framework

Riyad Bot Framework is a highly modular, scalable, and extremely fast server-side Messenger Bot Framework written completely from scratch in **Node.js (CommonJS)**. 

Designed for developers, it features **100% GoatBot V2 command and plugin compatibility**, an integrated high-performance **JSON state database**, seamless **Google Gemini 3.5 API support**, real-time **WebSocket logs streaming**, and an interactive, responsive **Web Status Dashboard**.

---

## 📂 Project Structure

```bash
riyad-bot/
├── app.js               # Primary server-side boot entry point
├── config.json          # Global prefix, administrative IDs, and anti-spam controls
├── account.txt          # credentials placeholder
├── appstate.json        # mock cookie login storage
├── package.json         # core backend dependencies
├── .env.example         # environment variables variables example
├── database/            # persistent local storage database JSON schemas
├── cache/               # temporary media and download caches
├── logs/                # system event logs
├── cron/                # system automated jobs
│   └── systemBackup.js  # database backup and cache flusher schedulers
├── api/                 # REST routing and event controllers
│   └── routes/
│       └── api.js       # REST api endpoints and real-time simulators
├── web/
│   └── dashboard/       # status dashboards & interactive chat client
│       └── index.html
├── languages/           # multi-language translation bundles
│   ├── en.json
│   └── vi.json
└── scripts/
    ├── cmds/            # built-in commands (help, ping, uptime, ai, economy)
    ├── events/          # system events (welcome join, nickname updates)
    ├── handlers/        # command loaders and hot reload controllers
    │   ├── commandLoader.js
    │   └── eventLoader.js
    ├── middleware/      # message screening middleware
    │   └── botEngine.js # core rate-limiting and permission router
    └── utils/
        ├── database.js  # database abstraction interface
        └── logger.js    # console color logging utility
```

---

## 🚀 Installation & Local Guide

### 1. Prerequisites
Ensure you have **Node.js (version 18 or above)** installed on your host system.

### 2. Install Dependencies
In your root workspace directory, run:
```bash
npm install
```

### 3. Setup Secrets
Copy `.env.example` into a new file named `.env`:
```bash
cp .env.example .env
```
Fill in your details:
- `GEMINI_API_KEY`: Provide your Google AI Studio API key.
- `APP_URL`: The URL where your bot server is hosted.

### 4. Running the Bot Server
To boot the server-side bot framework:
```bash
npm run dev
```
The server will start listening on **Port 3000** (host `0.0.0.0`). Open your browser at `http://localhost:3000` to inspect the live status dashboard!

---

## ⚙️ Configuration Guide (`config.json`)

Configure your server features directly inside `/config.json`:

| Config Field | Description |
| :--- | :--- |
| `botName` | Name representing the bot in greetings |
| `prefix` | Default prefix character trigger (e.g. `/`) |
| `ownerIDs` | Array of Facebook User IDs representing the framework owner (Role level 3) |
| `adminIDs` | Array of Facebook User IDs representing bot developers/moderators (Role level 2) |
| `language` | Active system locale language ('en' or 'vi') |
| `antiSpam.limit` | Max number of messages a user can send before getting throttled |
| `antiSpam.blockDuration` | Cooldown block penalty for spam triggers (in milliseconds) |
| `antiLink.enabled` | Enable or disable automatic group link-filtering |
| `antiBadword.words` | Prohibited words arrays that trigger warnings on group chats |

---

## 🛠️ Command Development Guide (GoatBot V2 compatible)

Creating custom commands is simple. Add a standard CommonJS module inside `scripts/cmds/<name>.js`.

### Template:
```javascript
module.exports = {
  config: {
    name: "mycommand",
    aliases: ["myalias", "testcmd"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 5,        // Cooldown timer in seconds
    role: 0,             // 0 = Everyone, 1 = Group Admin, 2 = Bot Admin, 3 = Owner
    category: "general", // Menu category
    guide: {
      en: "{pn} or {pn} [some argument]"
    },
    description: {
      en: "This is my custom server-side command"
    }
  },

  // Runs when user calls prefix + command
  onStart: async function({ api, event, args, message, usersData, threadsData }) {
    const sender = event.senderName;
    await api.sendMessage(`Hello ${sender}! Your arguments were: ${args.join(', ')}`, event.threadID);
  },

  // Runs on any message (optional)
  onChat: async function({ api, event, args, message }) {
    // Custom auto-responders or filters
  }
};
```

---

## 📂 Event Development Guide

Add system event listeners inside `/scripts/events/<name>.js`:

```javascript
module.exports = {
  config: {
    name: "groupwelcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Bot"
  },

  onStart: async function({ api, event, threadsData }) {
    if (event.logMessageType === "log:subscribe") {
      await api.sendMessage(`👋 Welcome! Be nice and read the group rules.`, event.threadID);
    }
  }
};
```

---

## 🔗 REST API Specifications

The Riyad Bot Framework exposes a rich suite of developer REST API endpoints:

### 1. `GET /api/status`
Returns real-time server health, platform uptime, CPU/memory, and database sizes.
- **Response:**
  ```json
  {
    "status": "active",
    "botName": "Riyad Bot",
    "prefix": "/",
    "stats": { "users": 1, "threads": 1, "totalCommands": 6 },
    "system": { "uptime": 45000, "nodeVersion": "v22.14.0" }
  }
  ```

### 2. `GET /api/commands`
Returns descriptions, category, permissions, and instructions of all loaded commands.

### 3. `GET /api/logs`
Retrieves the last 100 lines of system logs recorded in the `/logs/bot.log` file.

### 4. `POST /api/simulate`
Simulates a real Facebook incoming message payload.
- **Request:**
  ```json
  {
    "senderID": "100076133880000",
    "senderName": "Hasan Riyad",
    "threadID": "1234567890",
    "body": "/ai what is the capital of Vietnam?",
    "isGroupAdmin": true
  }
  ```

---

## 🌐 Cloud Deployment Guide

Riyad Bot is production-ready and fully dockerized or container-native.

### Deploying to Cloud Run (Google Cloud)
Since Riyad Bot runs entirely on the server-side, it deploys seamlessly to Cloud Run.
1. Make sure your environment variables (especially `GEMINI_API_KEY`) are declared under the Cloud Run revision settings.
2. Ensure Port is configured to start on **Port 3000** (handled automatically via `app.js`).
3. Deploy the container. The dashboard status control panel will be live on your Cloud Run service URL!

---

## 📄 License
This framework is released as open-source under the terms of the **MIT License**. Created by **Riyad Bot**. Feel free to extend and publish your commands!
