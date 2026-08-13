/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              CLAUDE AI — RIYAD FRAMEWORK                     ║
 * ║  Command: claude  |  Aliases: fable, ai                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Uses ZenMux (https://zenmux.ai) as an OpenAI-compatible proxy to
 * Claude Fable 5 — no Anthropic SDK needed, just a plain axios POST
 * to the Chat Completions endpoint.
 *
 * SETUP:
 *   Add this environment variable on the bot's Railway service:
 *     ZENMUX_API_KEY = <your zenmux api key>
 *
 * USAGE:
 *   claude <question>
 */
"use strict";

const axios = require("axios");

const API_KEY = process.env.ZENMUX_API_KEY || "";
const BASE_URL = "https://zenmux.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-fable-5";

async function askClaude(prompt, history) {
  const messages = [...(history || []), { role: "user", content: prompt }];
  const res = await axios.post(
    BASE_URL,
    { model: MODEL, messages },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      timeout: 60000
    }
  );

  const choice = res.data && res.data.choices && res.data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text || !text.trim()) {
    const snippet = JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Empty response from ZenMux. Raw: ${snippet}`);
  }
  return text.trim();
}

module.exports = {
  config: {
    name: "claude",
    aliases: ["fable", "how"],
    version: "1.0.0",
    author: "Riyad Bot Team",
    countDown: 5,
    role: 0,
    shortDescription: "Chat with Claude (Fable 5) via ZenMux",
    longDescription: "Ask Claude Fable 5 anything, routed through the ZenMux OpenAI-compatible API.",
    category: "ai",
    guide: { en: "claude <question>" }
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    if (!API_KEY) {
      return api.sendMessage(
        "❌ ZENMUX_API_KEY সেট করা নেই। Railway-তে এই bot সার্ভিসের Environment Variables-এ ZENMUX_API_KEY যোগ করো।",
        threadID, messageID
      );
    }

    const prompt = args.join(" ").trim();
    if (!prompt) {
      return api.sendMessage(
        "❌ Usage: claude <question>\nExample: claude what is the meaning of life?",
        threadID, messageID
      );
    }

    const hasReaction = typeof api.setMessageReaction === "function";
    if (hasReaction) api.setMessageReaction("💭", messageID, () => {}, true);

    try {
      const text = await askClaude(prompt);
      if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
      return api.sendMessage(text, threadID, messageID);
    } catch (e) {
      if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
      const errMsg = (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message || String(e);
      return api.sendMessage(`❌ Failed: ${errMsg}`, threadID, messageID);
    }
  }
};
