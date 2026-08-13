/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              AI TEXT & IMAGE — RIYAD FRAMEWORK                ║
 * ║  Command: llm  |  Aliases: imagine, ask                       ║
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
 *  2. Add at least one free provider key in its dashboard, then find your
 *     unified key under Coding Agents → "Show API key".
 *  3. Set these two environment variables on THIS bot's service:
 *       FREELLMAPI_URL = https://<your-freellmapi-app>.up.railway.app/v1
 *       FREELLMAPI_KEY = freellma...xxxxx
 *
 * USAGE:
 *   llm <question>            → text answer
 *   llm image <prompt>        → generates and sends an image
 *   ask <question>            → alias for text
 *   imagine <prompt>          → alias for image
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const BASE_URL = (process.env.FREELLMAPI_URL || "http://localhost:3001/v1").replace(/\/+$/, "");
const API_KEY = process.env.FREELLMAPI_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY_2 || "";

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
  const message = choice && choice.message;

  // Normally content is a plain string. Some reasoning models occasionally
  // return it as an array of {type:"text", text:...} parts, or (rarely)
  // leave content empty and only fill the "reasoning" field. Handle all of
  // these instead of failing outright.
  let text = message && message.content;
  if (Array.isArray(text)) {
    text = text.map(p => (typeof p === "string" ? p : p.text || "")).join("").trim();
  }
  if ((!text || !text.trim()) && message && typeof message.reasoning === "string") {
    text = message.reasoning.replace(/<\/?think>/gi, "").trim();
  }

  if (!text || !text.trim()) {
    // Surface a short snippet of the raw response so the real cause is
    // visible instead of a generic "empty" message.
    const snippet = JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Empty response from FreeLLMAPI. Raw: ${snippet}`);
  }

  const routedVia = res.headers["x-routed-via"]
    || (res.data._routed_via && `${res.data._routed_via.platform}/${res.data._routed_via.model}`)
    || null;
  return { text: text.trim(), routedVia };
}

// ─────────────────────────────────────────────
//  IMAGE GENERATION
//
//  Primary: Gemini's own image-generation model ("Nano Banana" /
//  gemini-2.5-flash-image) via the GEMINI_API_KEY already set on this
//  bot's Railway service. This is genuinely the same Gemini image engine
//  people mean when they say "like Gemini" — noticeably better quality
//  than Pollinations for most prompts.
//
//  Fallback: Pollinations.ai (free, no key needed) — used only if no
//  Gemini key is configured, or if the Gemini call fails for any reason,
//  so image generation never goes completely dead.
// ─────────────────────────────────────────────
async function generateImageGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }]
  }, { timeout: 60000 });

  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData && p.inlineData.data);
  if (!imgPart) {
    const textPart = parts.find(p => p.text);
    throw new Error(textPart ? `Gemini declined: ${textPart.text.slice(0, 200)}` : "Gemini returned no image data.");
  }
  return Buffer.from(imgPart.inlineData.data, "base64");
}

async function generateImagePollinations(prompt) {
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  const buf = Buffer.from(res.data);
  if (buf.length < 500) throw new Error("Pollinations returned an unexpectedly small/empty image.");
  return buf;
}

async function generateImage(prompt) {
  if (GEMINI_KEY) {
    try {
      return await generateImageGemini(prompt);
    } catch (e) {
      console.error("[llm.js] Gemini image generation failed, falling back to Pollinations:", e.message);
    }
  }
  return await generateImagePollinations(prompt);
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
    guide: { en: "llm <question> | llm image <prompt> | ask <question> | imagine <prompt>" }
  },

  onStart: async function ({ api, event, args, commandName }) {
    const { threadID, messageID, body } = event;

    if (!API_KEY) {
      return api.sendMessage(
        "❌ FREELLMAPI_KEY টি সেট করা নেই। Railway তে এই bot সার্ভিসের Environment Variables এ FREELLMAPI_URL এবং FREELLMAPI_KEY যোগ করুন।",
        threadID, messageID
      );
    }

    // FIX: `commandName` from the framework is unreliable for alias
    // detection — it's normalized to the primary command name ("llm")
    // even when the user actually typed the "imagine" alias, so checking
    // commandName === "imagine" never matched and everything fell through
    // to text mode. Instead, read the first word the user actually typed
    // straight from event.body.
    const typedWord = (body || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
    let isImage = typedWord === "imagine";
    let promptArgs = args;
    if (!isImage && args[0] && args[0].toLowerCase() === "image") {
      isImage = true;
      promptArgs = args.slice(1);
    }

    const prompt = promptArgs.join(" ").trim();
    if (!prompt) {
      return api.sendMessage(
        isImage
          ? "❌ Usage: llm image <prompt>\nExample: llm image a cat riding a bicycle"
          : "❌ Usage: llm <question>\nExample: llm what is the capital of Bangladesh?",
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
