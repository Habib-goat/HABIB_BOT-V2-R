<!--
  RIYAD BOT Framework v2.0.0 — Official README
  Theme: Deep Crimson (#7A0010) × Warm Peach (#F5D2B3)
-->

<div align="center">

<img src="logo.png" alt="RIYAD BOT" width="220" height="220" style="border-radius:28px;border:4px solid #F5D2B3;"/>

# 🌹 RIYAD BOT FRAMEWORK

### The Premium Facebook Messenger Bot Engine for Node.js

**Elegant. Blazing Fast. Infinitely Modular.**

<p>
  <img src="https://img.shields.io/badge/version-2.0.0-7A0010?style=for-the-badge&labelColor=1a1a1a" alt="version"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-F5D2B3?style=for-the-badge&labelColor=7A0010" alt="node"/>
  <img src="https://img.shields.io/badge/license-MIT-7A0010?style=for-the-badge&labelColor=1a1a1a" alt="license"/>
  <img src="https://img.shields.io/badge/database-MongoDB-F5D2B3?style=for-the-badge&labelColor=7A0010" alt="database"/>
</p>
<p>
  <img src="https://img.shields.io/badge/FCA-fca--eryxenx%20v37-7A0010?style=flat-square&labelColor=F5D2B3" alt="fca"/>
  <img src="https://img.shields.io/badge/AI-Gemini%20Powered-7A0010?style=flat-square&labelColor=F5D2B3" alt="ai"/>
  <img src="https://img.shields.io/badge/dashboard-Live%20WebSocket-7A0010?style=flat-square&labelColor=F5D2B3" alt="dashboard"/>
  <img src="https://img.shields.io/badge/commands-40%2B-7A0010?style=flat-square&labelColor=F5D2B3" alt="commands"/>
</p>

> **Note:** replace `Riyad761/RIYAD_BOT-V2` badges below with your real GitHub path once the repo is public — dynamic `shields.io` badges only render once the repo can actually be resolved.

<sub>
<a href="https://github.com/Riyad761/RIYAD_BOT-V2/stargazers">⭐ Star this repo</a> ·
<a href="https://github.com/Riyad761/RIYAD_BOT-V2/issues">🐛 Report a bug</a> ·
<a href="https://github.com/Riyad761/RIYAD_BOT-V2/fork">🍴 Fork it</a>
</sub>

</div>

<br/>

<div align="center">
  <img src="assets/help.gif" alt="RIYAD BOT — live help menu preview" width="380"/>
  <p><i>Live preview — the auto-generated /help catalog in action</i></p>
</div>

---

## 📌 Table of Contents

| | | |
|---|---|---|
| 1. [📖 About](#-about-riyad-bot) | 8. [🛠️ Command Dev Guide](#️-command-development-guide) | 15. [📈 Performance](#-performance-optimization) |
| 2. [⚡ Philosophy](#-core-philosophy) | 9. [📡 Event Dev Guide](#-event-development-guide) | 16. [💬 FAQ](#-frequently-asked-questions-faq) |
| 3. [✨ Key Features](#-key-features) | 10. [🔌 API Reference](#-api-reference-fca-integration) | 17. [🔄 Changelog](#-changelog--version-history) |
| 4. [🎮 Command Catalog](#-command-catalog) | 11. [🗄️ Database Layer](#️-database-layer-mongodb) | 18. [🤝 Contributing](#-contribution-protocols) |
| 5. [📂 Directory Blueprint](#-directory-blueprint) | 12. [🤖 Gemini AI](#-gemini-ai-orchestration) | 19. [📞 Contact](#-contact--support) |
| 6. [🚀 Installation](#-installation-guide) | 13. [🖥️ Web Dashboard](#️-web-dashboard--websockets) | 20. [🎗️ Credits](#️-credits--dedications) |
| 7. [⚙️ Configuration](#️-configuration-manual) | 14. [🛡️ Security](#️-security-architecture) | 21. [📄 License](#-license-specification) |

---

## 📖 About RIYAD BOT

**RIYAD BOT** is a production-grade, enterprise-quality chatbot engine for Facebook Messenger, built entirely on modern **Node.js (CommonJS)**. It replaces the tangled, single-file bot scripts common in this space with a clean, service-oriented architecture: a dynamic command/event loader, a Mongoose-backed data layer, a plugin system, a live WebSocket dashboard, and native Gemini AI orchestration — all wired together out of the box.

```
┌──────────────────────────────────────────────────────────────────┐
│                       RIYAD BOT ARCHITECTURE                      │
├──────────────────────────────────────────────────────────────────┤
│   Express API + Dashboard  ◄──────────►  WebSocket Live Console  │
├──────────────────────────────────────────────────────────────────┤
│      Command Loader            Event Loader          Plugins     │
│            │                        │                   │        │
│            ▼                        ▼                   ▼        │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │              FCA Core  (fca-eryxenx v37)                   │ │
│   └────────────────────────────┬───────────────────────────────┘ │
│                                 ▼                                 │
│                   ┌──────────────────────────┐                    │
│                   │   MongoDB / Mongoose      │                   │
│                   │   Users · Threads · Set.  │                   │
│                   └──────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────┘
```

#### Why developers choose it
* **True isolation** — every command in `scripts/cmds/` is a self-contained module with its own `config`, `onStart`, and cooldown lifecycle.
* **Resilient sessions** — powered by `fca-eryxenx v37` with automatic re-login and session-state preservation.
* **Hot-loadable everything** — commands, events, and plugins are discovered and bound dynamically, no manual index files to maintain.

---

## ⚡ Core Philosophy

1. **Zero-Friction Command Creation** — drop a file into `scripts/cmds/`, and the loader picks it up instantly.
2. **Durable, Structured Storage** — MongoDB via Mongoose gives you real schemas for users, threads, and settings instead of fragile flat files.
3. **Ironclad Protection** — layered permission roles, cooldown buckets, and anti-spam/anti-link/anti-badword shields keep threads clean.

---

## ✨ Key Features

<table width="100%">
<thead>
<tr>
<th align="left" width="33%">🧱 Core & Architecture</th>
<th align="left" width="33%">🔌 Modules & Hooks</th>
<th align="left" width="33%">🛡️ Control & Security</th>
</tr>
</thead>
<tbody>
<tr>
<td>
<b>Node.js 18+</b><br/>Modern LTS runtime, V8-optimized.<br/><br/>
<b>CommonJS Core</b><br/>Familiar, dependency-light module system.<br/><br/>
<b>fca-eryxenx v37</b><br/>Stable, actively maintained FCA transport.<br/><br/>
<b>Express + WebSocket</b><br/>REST API and a real-time live dashboard.
</td>
<td>
<b>Dynamic Command Loader</b><br/>Auto-discovers everything in <code>scripts/cmds/</code>.<br/><br/>
<b>Dynamic Event Loader</b><br/>Binds <code>scripts/events/</code> to FCA log types.<br/><br/>
<b>Plugin Manager</b><br/>Load external, self-registering plugins.<br/><br/>
<b>Gemini AI Integration</b><br/>Native server-side smart replies.
</td>
<td>
<b>Role-Based Permissions</b><br/>Member / Admin / Owner tiers.<br/><br/>
<b>Anti-Spam Engine</b><br/>Threshold-based lockout with cooldown windows.<br/><br/>
<b>Anti-Link & Anti-Badword</b><br/>Configurable word/URL filters per thread.<br/><br/>
<b>React-to-Unsend</b><br/>Admin-only emoji-triggered message recall.
</td>
</tr>
<tr><td colspan="3"><hr/><b>🛠️ Utility & Services Layer</b></td></tr>
<tr>
<td><b>MongoDB Data Layer</b><br/>Mongoose models for Users, Threads, Settings, Notices.</td>
<td><b>Store Sync / Upload / Cache</b><br/>Full service suite for external data sync in <code>scripts/services/</code>.</td>
<td><b>Cron Backup System</b><br/>Scheduled system backups via <code>cron/systemBackup.js</code>.</td>
</tr>
<tr>
<td><b>Multi-language Support</b><br/>Locale files for English & Vietnamese in <code>languages/</code>.</td>
<td><b>Economy System</b><br/>Built-in currency/leveling command module.</td>
<td><b>Auto-Timer Service</b><br/>Scheduled recurring announcements per thread.</td>
</tr>
</tbody>
</table>

---

## 🎮 Command Catalog

A snapshot of the commands shipped in `scripts/cmds/` — 40+ modules across system, media, moderation, and fun categories.

| Category | Commands |
|---|---|
| **⚙️ System** | `help`, `info`, `cmd`, `prefix`, `rs`, `uptime`, `autotimer`, `settings` |
| **🛡️ Owner / Moderation** | `kick`, `clear`, `filecmd`, `sh`, `protect`, `adduser`, `tag` |
| **🎬 Media** | `autodl`, `catbox`, `convertmp3`, `imgur`, `link`, `pp`, `ppall`, `upload`, `pinterest` |
| **🧰 Utility** | `uid`, `fbinfo`, `lyrics`, `notice`, `note`, `one_time`, `inbox` |
| **🎵 Fun & Extras** | `song`, `surah`, `baby`, `economy`, `text`, `edit`, `out` |
| **🤖 AI** | `ai` (Gemini-powered conversation & Q&A) |

> Run `help` (or `menu` / `commands` / `cmds`) in any connected thread for the live, auto-generated catalog shown in the preview above.

---

## 📂 Directory Blueprint

```
RIYAD_BOT-V2/
├── 📄 app.js                       # Main entry point — boots DB, loaders, API & dashboard
├── 📄 config.json                  # Primary bot configuration (prefix, roles, DB URI, AI, security)
├── 📄 appstate.json                # Facebook session cookies — NEVER commit this file
├── 📂 controllers/
│   └── 📄 botController.js         # Stats & command-list REST controllers
├── 📂 api/routes/
│   └── 📄 api.js                   # Express router — /status, /commands, live console feed
├── 📂 scripts/
│   ├── 📂 cmds/                    # 40+ command modules (help, ai, economy, media tools...)
│   ├── 📂 events/                  # welcome, goodbye, antileave, callwelcome, botWelcome
│   ├── 📂 handlers/                # commandLoader.js, eventLoader.js — dynamic module discovery
│   ├── 📂 services/                # StoreSync, StoreUploader, StoreCache, autotimerService...
│   ├── 📂 models/                  # Thread.js, User.js, Settings.js, Notice.js (Mongoose schemas)
│   ├── 📂 middleware/              # botEngine.js — core message pipeline
│   ├── 📂 utils/                   # database.js, logger.js, atomicWrite.js, parser.js, hash.js
│   ├── 📂 plugins/                 # pluginManager.js — external plugin loader
│   ├── 📂 reactions/               # reactionManager.js
│   ├── 📂 replies/                 # replyManager.js — autoReply engine
│   └── 📂 data/                    # notices.json and other static data
├── 📂 cron/
│   └── 📄 systemBackup.js          # Scheduled backup job (node-cron)
├── 📂 languages/                   # en.json, vi.json — locale strings
├── 📂 models/
│   └── 📄 userModel.js
├── 📂 web/dashboard/                # Static assets & views for the live admin panel
├── 📂 assets/                       # Logo, preview GIFs, notice banners
├── 📄 package.json                 # Manifest, scripts, dependencies
└── 📄 README.md                    # This document
```

---

## 🚀 Installation Guide

### Prerequisites
* **Node.js** `v18.0.0+` (LTS recommended)
* **npm** `>=9.0.0`
* **Git**
* A **MongoDB** connection string (Atlas or self-hosted)

### Step 1 — Clone
```bash
git clone https://github.com/Riyad761/RIYAD_BOT-V2.git
cd RIYAD_BOT-V2
```

### Step 2 — Install dependencies
```bash
npm install
```

### Step 3 — Provide your Facebook session
1. Install a cookie-export extension (e.g. *Appstate Getter*, *EditThisCookie*).
2. While logged into your bot's Facebook account, export cookies as raw JSON.
3. Save them into `appstate.json` at the project root.

> [!WARNING]
> **`appstate.json` is a full session key to that Facebook account.** Never commit it, never share it, and make sure it's listed in `.gitignore`. The same goes for any real MongoDB URI or API key in `config.json` — treat both as secrets.

### Step 4 — Configure
Edit `config.json` with your bot name, prefix, admin/owner IDs, MongoDB URI, and Gemini API key — see [Configuration Manual](#️-configuration-manual).

### Step 5 — Launch
```bash
npm start        # Production
npm run dev       # Development (same entry, faster iteration)
```

### Troubleshooting
| Symptom | Fix |
|---|---|
| `Login Failed` on boot | Your Facebook session expired — re-export `appstate.json` from a fresh browser login. |
| `EADDRINUSE: port already in use` | Change `"port"` in `config.json` to a free port (e.g. `8080`). |
| `MongoServerError: bad auth` | Double-check `database.uriMongodb` credentials and IP allow-list in Atlas. |

---

## ☁️ Deployment Hub

<details>
<summary><b>Railway</b></summary>

1. Connect GitHub to Railway → **New Project** → **Deploy from GitHub repo**.
2. Select `RIYAD_BOT-V2`.
3. Add environment variables: `PORT`, `NODE_ENV=production`, plus your Mongo URI / Gemini key if you keep secrets in `.env`.
4. Railway builds and boots automatically — logs stream live.
</details>

<details>
<summary><b>Render</b></summary>

1. **New** → **Web Service** → select your repo.
2. Runtime: `Node` · Build: `npm install` · Start: `node app.js`.
3. Deploy — Render assigns a public URL for the dashboard.
</details>

<details>
<summary><b>Replit</b></summary>

1. Import the repo, confirm Node `>=18`.
2. Hit **Run**.
3. Use an uptime pinger (e.g. UptimeRobot) against the web view URL to prevent cold sleep.
</details>

<details>
<summary><b>VPS (Ubuntu)</b></summary>

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
git clone https://github.com/Riyad761/RIYAD_BOT-V2.git && cd RIYAD_BOT-V2
sudo npm install -g pm2
npm install
nano appstate.json      # paste your session cookies
pm2 start app.js --name "riyad-bot"
pm2 startup && pm2 save
```
</details>

<details>
<summary><b>Local background run</b></summary>

```bash
nohup node app.js > output.log 2>&1 &
```
</details>

---

## ⚙️ Configuration Manual

`config.json` drives the entire runtime. Key sections:

```json
{
  "botName": "Riyad Bot",
  "prefix": "/",
  "adminIDs": ["..."],
  "ownerIDs": ["..."],
  "port": 3000,
  "antiSpam": { "enabled": false, "limit": 5, "timeWindow": 10000 },
  "antiLink": { "enabled": true, "action": "warn" },
  "antiBadword": { "enabled": true, "words": ["spam", "scam", "hack", "abuse"] },
  "autoReply": { "enabled": true, "replies": { "hello": "..." } },
  "autoReact": { "enabled": true, "reactions": { "love": "❤️" } },
  "database": { "type": "mongodb", "uriMongodb": "YOUR_MONGODB_URI" },
  "reactUnsend": { "enable": true, "onlyAdmin": true, "emojis": ["😡", "🤬"] },
  "gemini": { "model": "gemini-2.5-flash", "systemInstruction": "..." }
}
```

| Key | Type | Purpose |
|---|---|---|
| `botName` | String | Displayed on help banners and system cards. |
| `prefix` | String | Symbol required to trigger commands. |
| `adminIDs` / `ownerIDs` | Array | UIDs with elevated command access. |
| `antiSpam` | Object | Rate-limit thresholds and block duration. |
| `antiLink` | Object | Auto-moderation for unsolicited links. |
| `antiBadword` | Object | Word filter list and enforcement toggle. |
| `database.uriMongodb` | String | Mongoose connection string — **treat as a secret**. |
| `gemini.model` | String | Gemini model used for AI-powered replies. |
| `reactUnsend` | Object | Emoji-triggered message recall for admins. |

> [!IMPORTANT]
> Never leave a real, working MongoDB URI (with a live username/password) checked into version control — rotate the credential and load it from an environment variable instead if this repo has ever been pushed publicly with one inside.

---

## 🛠️ Command Development Guide

Commands live in `scripts/cmds/`. On boot, `commandLoader.js` discovers and indexes every file automatically.

```javascript
module.exports = {
  config: {
    name: "commandName",
    aliases: ["cmd1", "cmd2"],
    version: "1.0.0",
    author: "Your Name",
    countDown: 5,
    role: 0,          // 0 = everyone · 1 = group admin · 2 = bot owner/admin
    category: "utility",
    description: "What this command does."
  },

  onStart: async function({ api, event, args, usersData, threadsData }) {
    // Fired when a user types: <prefix><name>
  },

  onChat: async function({ api, event, usersData, threadsData }) {
    // Fired on every message, prefix or not
  }
};
```

### Config properties
* **`name`** *(required)* — primary trigger identifier.
* **`aliases`** *(optional)* — alternative trigger names.
* **`countDown`** *(optional)* — per-user cooldown in seconds.
* **`role`** *(required)* — `0` everyone · `1` thread admins · `2` bot owner/admins.
* **`category`** *(optional)* — grouping shown on the `/help` catalog.

### Example — Math Solver
```javascript
module.exports = {
  config: {
    name: "math",
    aliases: ["calc", "solve"],
    version: "1.0.0",
    author: "Riyad Hasan",
    countDown: 3,
    role: 0,
    category: "utility",
    description: "Evaluates safe arithmetic expressions."
  },
  onStart: async function({ api, event, args }) {
    const expression = args.join(" ");
    if (!expression) return api.sendMessage("⚠️ Example: /math 2 + 2 * 10", event.threadID, event.messageID);
    if (/[^0-9+\-*/().\s]/g.test(expression)) {
      return api.sendMessage("❌ Only numbers and + - * / ( ) are allowed.", event.threadID, event.messageID);
    }
    const result = eval(expression);
    return api.sendMessage(`📝 ${expression} = ${result}`, event.threadID, event.messageID);
  }
};
```

---

## 📡 Event Development Guide

Event files live in `scripts/events/` and bind to FCA `log:*` message types via `eventLoader.js`.

```javascript
module.exports = {
  config: {
    name: "welcome",
    eventType: ["log:subscribe"],
    version: "1.0.0",
    author: "Riyad Hasan"
  },
  onStart: async function({ api, event, threadsData, usersData }) {
    if (event.logMessageType === "log:subscribe") {
      const thread = threadsData.getThread(event.threadID);
      for (const p of event.logMessageData.addedParticipants) {
        const msg = thread.settings.welcomeMessage
          .replace(/{name}/g, p.fullName)
          .replace(/{threadName}/g, thread.name);
        await api.sendMessage(msg, event.threadID);
      }
    }
  }
};
```

Shipped event modules: `welcome`, `goodbye`, `botWelcome`, `memberWelcome`, `callwelcome`, `antileave`.

---

## 🔌 API Reference (FCA Integration)

| Method | Description |
|---|---|
| `api.sendMessage(msg, threadID, messageID?)` | Sends a text or attachment payload. |
| `api.editMessage(newText, messageID)` | Edits a message previously sent by the bot. |
| `api.unsendMessage(messageID)` | Recalls/deletes a sent message. |
| `api.setMessageReaction(emoji, messageID)` | Adds a reaction to a target message. |
| `api.shareContact(text, uid, threadID, messageID)` | Shares a contact card (used by `/uid`). |

The Express layer also exposes:
* `GET /api/status` — bot stats, uptime, user/thread counts.
* `GET /api/commands` — live command registry (name, role, category).

---

## 🗄️ Database Layer (MongoDB)

RIYAD BOT persists state through **Mongoose** models rather than flat JSON files, giving you real schema validation and query support.

```
scripts/models/
 ├── User.js       → id, name, exp, level, money, bank, lastDaily, banned, inventory
 ├── Thread.js     → threadID, name, prefix, settings (welcome, antiLink, etc.)
 ├── Settings.js   → global runtime settings
 └── Notice.js     → scheduled/broadcast notices
```

```javascript
const { getUser, updateUser } = require("./scripts/utils/database");

const user = await getUser(senderID);
await updateUser(senderID, { money: user.money + 250 });
```

Connection is established once via `database.connectDB()` and reused across the app lifecycle.

---

## 🤖 Gemini AI Orchestration

```
User message ──► prefix check (fail) ──► mentioned or DM? ──► Gemini request
                                                                    │
                                                         model: gemini-2.5-flash
                                                                    │
                                                            api.sendMessage(reply)
```

**Setup:**
1. Get an API key from Google AI Studio.
2. Set it via the `GEMINI_API_KEY` environment variable (see `.env.example`) or `config.gemini`.
3. Mention the bot or DM it directly — no prefix needed — to route the message to Gemini.

---

## 🖥️ Web Dashboard & WebSockets

```
        Web Dashboard (port 3000)
                 │  WebSocket (bi-directional)
                 ▼
        Core Process + Command/Event Loaders
```

* **Live console** — streamed logs over WebSocket.
* **Command registry view** — inspect every loaded command, its role, and category.
* **Thread management** — view active threads and per-thread settings.

---

## 🛡️ Security Architecture

```
Incoming message ─► Anti-Spam check ─► Permission check ─► Command execution
                          │ blocked          │ blocked
```

**Permission tiers**
* `0` — Members: standard commands.
* `1` — Thread Admins: moderation commands.
* `2` — Bot Owner/Admins: system-level and destructive commands.

**Built-in shields:** anti-spam cooldown buckets, anti-link URL filtering, anti-badword list matching, and admin-only react-to-unsend.

> [!CAUTION]
> This repository currently ships a config file with a **live MongoDB connection string that includes a real username and password**, plus real Facebook admin/owner UIDs. Before making this repo public, rotate that database credential, move it into an environment variable, and scrub any real UIDs you don't want exposed.

---

## 📈 Performance Optimization

* **Hot module caching** — command and event modules are loaded once and reused.
* **Minimal dependency surface** — only the packages the runtime actually needs.
* **Async I/O throughout** — Mongoose queries and file operations never block the event loop.

---

## 💬 Frequently Asked Questions (FAQ)

<details><summary><b>My appstate expired — what do I do?</b></summary><br/>
Log back into the Facebook account in a fresh browser session, re-export cookies, overwrite <code>appstate.json</code>, and restart the bot.
</details>

<details><summary><b>Can I host this for free?</b></summary><br/>
Yes — Render and Replit free tiers work, but you'll want an external uptime pinger to prevent cold sleep.
</details>

<details><summary><b>How do I add more admins?</b></summary><br/>
Add the Facebook UID as a string to <code>adminIDs</code> in <code>config.json</code>.
</details>

<details><summary><b>Why MongoDB instead of a JSON file database?</b></summary><br/>
Mongoose gives schema validation, indexing, and safe concurrent writes — all things flat JSON files struggle with once you have many active threads.
</details>

<details><summary><b>How do I create a new command?</b></summary><br/>
Add a file to <code>scripts/cmds/</code> following the standard command structure above, then restart (or hot-reload from the dashboard, if enabled).
</details>

<details><summary><b>Is fca-eryxenx safe to use?</b></summary><br/>
It's an actively maintained fork of the original Facebook Chat API, but any unofficial FCA library carries some risk of account action from Meta — use a secondary/developer account, not your personal one.
</details>

<details><summary><b>Is this safe for my main Facebook account?</b></summary><br/>
We recommend a dedicated secondary account, sensible cooldowns, and avoiding mass messaging — this reduces (but doesn't eliminate) the risk of account restrictions.
</details>

---

## 🔄 Changelog & Version History

**v2.0.0 — Current**
* Migrated persistence from flat JSON files to MongoDB via Mongoose.
* Added native Gemini AI orchestration.
* Introduced the plugin manager, service layer (StoreSync/Uploader/Cache), and cron-based backups.
* Added multi-language support (`en`, `vi`).
* Built the live Express + WebSocket admin dashboard.

---

## 🤝 Contribution Protocols

1. Fork the repository.
2. `git checkout -b feature/awesome-new-command`
3. Commit with clear, conventional messages.
4. Push and open a detailed Pull Request.

---

## 📞 Contact & Support

* **Developer:** [Riyad Hasan](https://www.facebook.com/munnir.jamai.jan)
* **Issues:** [GitHub Issues](https://github.com/Riyad761/RIYAD_BOT-V2/issues)
* **Email:** [hasanriyad761@gmail.com](mailto:hasanriyad761@gmail.com)

---

## 🎗️ Credits & Dedications

* **Riyad Hasan** — creator, architect, and maintainer.
* **fca-eryxenx developers** — for the transport layer this framework relies on.
* **Open-source community** — for feedback and contributions.

---

## 📄 License Specification

Licensed under the **MIT License**.

```
Copyright (c) 2026 Riyad Hasan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">

**Thank you for choosing RIYAD BOT Framework.**
<i>"Simplicity is the ultimate sophistication." — Leonardo da Vinci</i>

🌹 Made with passion by **Riyad Hasan** 🌹

</div>
