/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              AI TEXT & IMAGE — RIYAD FRAMEWORK                ║
 * ║  Command: ai  |  Aliases: gpt, imagine                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Uses FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi) — a
 * self-hosted OpenAI-compatible proxy — as the backend. Works for BOTH
 * text generation (/v1/chat/completions) and image generation
 * (/v1/images/generations).
 *
 * SETUP:
 *  1. Deploy FreeLLMAPI (e.g. as a second Railway service, Docker image
 *     ghcr.io/tashfeenahmed/freellmapi:latest).
 *  2. Add at least one free provider key in its dashboard, then generate
 *     a unified "freellmapi-..." key.
 *  3. Set these two environment variables on THIS bot's service:
 *       FREELLMAPI_URL = http://freellmapi.railway.internal:3001/v1
 *                         (or your public https:// URL + /v1)
 *       FREELLMAPI_KEY = freellmapi-xxxxxxxxxxxx
 *
 * USAGE:
 *   ai <question>            → text answer
 *   ai image <prompt>        → generates and sends an image
 *   gpt <question>           → alias for text
 *   imagine <prompt>         → alias for image
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const BASE_URL = (process.env.FREELLMAPI_URL || "http://localhost:3001/v1").replace(/\/+$/, "");
const API_KEY = process.env.FREELLMAPI_KEY || "";

function client() {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    }
  });
}

// ─────────────────────────────────────────────
//  TEXT GENERATION
// ─────────────────────────────────────────────
async function generateText(prompt) {
  const res = await client().post("/chat/completions", {
    model: "auto", // let FreeLLMAPI pick the best available free model
    messages: [{ role: "user", content: prompt }]
  });
  const choice = res.data && res.data.choices && res.data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new Error("Empty response from FreeLLMAPI.");
  return { text, routedVia: res.headers["x-routed-via"] || res.data._routed_via || null };
}

// ─────────────────────────────────────────────
//  IMAGE GENERATION
// ─────────────────────────────────────────────
async function generateImage(prompt) {
  const res = await client().post("/images/generations", {
    model: "auto",
    prompt,
    n: 1
  });
  const item = res.data && res.data.data && res.data.data[0];
  if (!item) throw new Error("Empty response from FreeLLMAPI.");

  if (item.url) {
    const imgRes = await axios.get(item.url, { responseType: "arraybuffer", timeout: 30000 });
    return Buffer.from(imgRes.data);
  }
  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  throw new Error("No image data (url/b64_json) in FreeLLMAPI response.");
}

// ─────────────────────────────────────────────
//  MODULE EXPORT
// ─────────────────────────────────────────────
module.exports = {
  config: {
    name: "llm",
    aliases: ["llm", "imagine", "ask"],
    version: "1.0.0",
    author: "Riyad Bot Team",
    countDown: 5,
    role: 0,
    shortDescription: "AI text & image generation (FreeLLMAPI)",
    longDescription: "Generate text answers or AI images through a self-hosted FreeLLMAPI proxy.",
    category: "ai",
    guide: { en: "ai <question> | ai image <prompt> | gpt <question> | imagine <prompt>" }
  },

  onStart: async function ({ api, event, args, commandName }) {
    const { threadID, messageID } = event;

    if (!API_KEY) {
      return api.sendMessage(
        "❌ FREELLMAPI_KEY টি সেট করা নেই। Railway তে এই bot সার্ভিসের Environment Variables এ FREELLMAPI_URL এবং FREELLMAPI_KEY যোগ করুন।",
        threadID, messageID
      );
    }

    // "imagine" alias, or "ai image <prompt>" / "gpt image <prompt>" → image mode
    let isImage = commandName === "imagine";
    let promptArgs = args;
    if (!isImage && args[0] && args[0].toLowerCase() === "image") {
      isImage = true;
      promptArgs = args.slice(1);
    }

    const prompt = promptArgs.join(" ").trim();
    if (!prompt) {
      return api.sendMessage(
        isImage
          ? "❌ Usage: ai image <prompt>\nExample: ai image a cat riding a bicycle"
          : "❌ Usage: ai <question>\nExample: ai what is the capital of Bangladesh?",
        threadID, messageID
      );
    }

    if (isImage) {
      api.sendMessage("🎨 Generating image...", threadID);
      try {
        const cacheDir = path.join(__dirname, "cache");
        await fs.ensureDir(cacheDir);
        const filePath = path.join(cacheDir, `ai_img_${Date.now()}.png`);
        const buf = await generateImage(prompt);
        await fs.writeFile(filePath, buf);
        await new Promise((resolve) =>
          api.sendMessage(
            { body: `🖼️ ${prompt}`, attachment: fs.createReadStream(filePath) },
            threadID,
            () => { resolve(); fs.remove(filePath).catch(() => {}); },
            messageID
          )
        );
      } catch (e) {
        api.sendMessage(`❌ Image generation failed: ${e.response?.data?.error?.message || e.message || String(e)}`, threadID, messageID);
      }
      return;
    }

    api.sendMessage("💭 Thinking...", threadID);
    try {
      const { text, routedVia } = await generateText(prompt);
      const footer = routedVia ? `\n\n— via ${routedVia}` : "";
      api.sendMessage(`${text}${footer}`, threadID, messageID);
    } catch (e) {
      api.sendMessage(`❌ Failed: ${e.response?.data?.error?.message || e.message || String(e)}`, threadID, messageID);
    }
  }
};
