/**
 * @file edit.js
 * @description AI Image Editor — reply to any image with a plain-language
 *              instruction (Bangla, Banglish, or English) and the bot edits it
 *              using deAPI's Image-to-Image API. No fixed command word needed —
 *              this hooks into onChat, so any reply-to-image message is treated
 *              as an edit request.
 * @credits Riyad
 * @dependencies axios, form-data, fs-extra, @google/genai
 * @env DEAPI_API_KEY   - required, from https://app.deapi.ai/dashboard/api-keys
 * @env GEMINI_API_KEY  - required, used to detect/translate Bangla & Banglish prompts
 * @env GEMINI_API_KEY_2, GEMINI_API_KEY_3 - optional fallback keys
 */

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs-extra");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const commandLoader = require("../handlers/commandLoader");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEAPI_BASE = "https://api.deapi.ai";
const DEAPI_KEY = process.env.DEAPI_API_KEY;

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
].filter(Boolean);

if (!DEAPI_KEY) {
  console.error("[edit.js] WARNING: DEAPI_API_KEY is not set — image editing will fail.");
}
if (!GEMINI_KEYS.length) {
  console.error("[edit.js] WARNING: no GEMINI_API_KEY set — prompts will be sent to deAPI untranslated.");
}

// Prefix characters this framework's commands can start with.
const PREFIX_CHARS = ["/", "!", ".", "-", "#"];

/**
 * True if `rawBody` looks like an invocation of a DIFFERENT loaded command
 * (e.g. "/pp", "!gptimage") rather than a plain-language edit instruction.
 * Only messages that start with a prefix char AND match a real command name
 * are excluded — plain sentences like "help me remove the background" are
 * never mistaken for a command since "help" alone (no prefix) doesn't match.
 */
function looksLikeOtherCommand(rawBody) {
  const firstWord = rawBody.trim().split(/\s+/)[0] || "";
  if (!PREFIX_CHARS.includes(firstWord[0])) return false;

  const withoutPrefix = firstWord.slice(1).toLowerCase();
  if (!withoutPrefix) return false;

  return commandLoader.commands.has(withoutPrefix) || commandLoader.aliases.has(withoutPrefix);
}

// Preferred img2img models, in priority order (matched against name or slug)
const MODEL_PRIORITY = [
  "qwen image edit plus",
  "flux.2 klein 4b bf16",
  "flux.1 dev",
  "flux.1 schnell"
];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_DIR = path.join(__dirname, "cache");

const client = axios.create({ timeout: 120000 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch available img2img models from deAPI and pick the best one. */
async function pickModel() {
  const resp = await client.get(`${DEAPI_BASE}/api/v2/models`, {
    headers: deapiHeaders(),
    params: { "filter[inference_types]": "img2img" }
  });

  const models = resp.data?.data || [];
  if (!models.length) {
    throw new Error("No Image-to-Image models are currently available on deAPI.");
  }

  for (const preferred of MODEL_PRIORITY) {
    const match = models.find(
      (m) =>
        m.name?.toLowerCase() === preferred ||
        m.slug?.toLowerCase() === preferred.replace(/[.\s]/g, "").toLowerCase() ||
        m.name?.toLowerCase().includes(preferred)
    );
    if (match) return match;
  }

  // Fallback: first available model
  return models[0];
}

function deapiHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${DEAPI_KEY}`,
    Accept: "application/json",
    ...extra
  };
}

/**
 * Detect + translate a Bangla / Banglish / English prompt into a clean,
 * professional English image-editing instruction using Gemini.
 * Falls back to the raw text if every Gemini key fails.
 */
async function translatePrompt(rawText) {
  if (!GEMINI_KEYS.length) return rawText.trim();

  const instruction = `You are a prompt translator for an AI image editing system.

Input text (may be Bangla, Banglish/Romanized Bangla, or English): "${rawText}"

Rules:
- If the input is Bangla or Banglish, translate it into natural, professional English.
- If it is already English, refine it into a clear, professional image-editing instruction.
- Preserve the user's intent exactly — do not add creative details they did not ask for.
- Unless the user explicitly asks to change them, the instruction must preserve: face, identity, hairstyle, skin tone, clothing, body, pose, and expression.
- Output ONLY the final English instruction. No quotes, no explanation, no extra text.`;

  let lastError;
  for (const apiKey of GEMINI_KEYS) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: instruction }] }]
      });

      const text =
        response.text ||
        response.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join(" ");

      if (text && text.trim()) return text.trim();
    } catch (err) {
      lastError = err;
      const msg = String(err.message || "");
      if (err.status === 429 || err.status === 404 || /RESOURCE_EXHAUSTED|NOT_FOUND/.test(msg)) {
        continue; // try next key
      }
      break; // non-recoverable error, stop trying
    }
  }

  // Translation failed — fall back to the raw prompt rather than blocking the edit.
  console.error("Prompt translation failed, using raw text:", lastError?.message);
  return rawText.trim();
}

async function downloadToBuffer(url) {
  const resp = await client.get(url, { responseType: "arraybuffer" });
  return Buffer.from(resp.data);
}

async function editMsg(api, msgId, text) {
  if (!api.editMessage || !msgId) return;
  try {
    await api.editMessage(text, msgId);
  } catch {
    /* ignore — editing progress messages is best-effort */
  }
}

/** Submit the edit job to deAPI and return the request_id. */
async function submitEditJob({ imageBuffer, prompt, model }) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("model", model.slug);
  form.append("steps", String(model.info?.defaults?.steps ?? 4));
  form.append("seed", "-1");
  form.append("image", imageBuffer, {
    filename: "input.jpg",
    contentType: "image/jpeg"
  });

  const resp = await client.post(`${DEAPI_BASE}/api/v2/images/edits`, form, {
    headers: deapiHeaders(form.getHeaders())
  });

  const requestId = resp.data?.data?.request_id;
  if (!requestId) throw new Error("deAPI did not return a request_id.");
  return requestId;
}

/** Poll a deAPI job until it's done, errors out, or times out. */
async function pollJob(requestId) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const resp = await client.get(`${DEAPI_BASE}/api/v2/jobs/${requestId}`, {
      headers: deapiHeaders()
    });
    const data = resp.data?.data;

    if (data?.status === "done") return data;
    if (data?.status === "error") {
      throw new Error(data?.error_message || "The image edit job failed on deAPI's side.");
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the image edit to finish.");
}

// ---------------------------------------------------------------------------
// Command export
// ---------------------------------------------------------------------------

module.exports = {
  config: {
    name: "edit",
    version: "3.0.0",
    hasPermission: 0,
    credits: "Riyad",
    description:
      "Reply to any image with an instruction (Bangla, Banglish, or English) to edit it with AI. No fixed command word needed.",
    commandCategory: "AI Image",
    usages: "Reply to an image with what you want changed, e.g. \"ghibli style\"",
    cooldowns: 5
  },

  // Manual fallback: "/edit <prompt>" while replying to an image still works.
  onStart: async function ({ api, event, args }) {
    const prompt = args.join(" ").trim();
    if (!prompt) {
      return api.sendMessage(
        "❌ Reply to an image with your edit instruction.\nExample: reply to a photo and type \"background remove kore dao\".",
        event.threadID,
        event.messageID
      );
    }
    return handleEditRequest({ api, event, prompt });
  },

  // Primary path: fires on every message. If it's a reply to a photo with
  // non-empty text, treat the whole message body as the edit instruction —
  // no "/edit" prefix required.
  onChat: async function ({ api, event }) {
    const replied = event.messageReply;
    const attachment = replied?.attachments?.[0];

    if (!replied || !attachment || attachment.type !== "photo") return;

    const rawBody = (event.body || "").trim();
    if (!rawBody) return;

    // Don't hijack other commands (e.g. "/pp", "!gptimage", or even our own
    // "/edit" with no prompt) sent while replying to a photo — let the
    // framework's normal dispatcher (and that command's own onStart) handle
    // those. Only plain-language text falls through to the auto-edit flow.
    if (looksLikeOtherCommand(rawBody)) {
      console.log(`[edit.js] onChat: skipping, looks like another command -> "${rawBody}"`);
      return;
    }

    console.log(`[edit.js] onChat: treating reply-to-image text as edit prompt -> "${rawBody}"`);
    await handleEditRequest({ api, event, prompt: rawBody, imageUrl: attachment.url });
  }
};

// ---------------------------------------------------------------------------
// Core flow
// ---------------------------------------------------------------------------

async function handleEditRequest({ api, event, prompt, imageUrl }) {
  const { threadID, messageID } = event;
  const attachment = imageUrl ? { url: imageUrl } : event.messageReply?.attachments?.[0];

  if (!DEAPI_KEY) {
    return api.sendMessage("❌ Server misconfigured: DEAPI_API_KEY is missing.", threadID, messageID);
  }
  if (!attachment || !attachment.url) {
    return api.sendMessage("❌ Please reply to an image to edit it.", threadID, messageID);
  }

  let progressId = null;
  let outPath = null;

  try {
    console.log("[edit.js] step: sending initial progress message");
    progressId = await new Promise((resolve) => {
      api.sendMessage("🖼️ Image detected...", threadID, (err, info) => {
        if (err) console.error("[edit.js] sendMessage(initial) error:", err);
        resolve(info?.messageID || null);
      }, messageID);
    });
    console.log("[edit.js] step: progressId =", progressId);

    await editMsg(api, progressId, "📥 Downloading your image...");
    console.log("[edit.js] step: downloading source image");
    const imageBuffer = await downloadToBuffer(attachment.url);
    console.log("[edit.js] step: image downloaded, bytes =", imageBuffer.length);

    await editMsg(api, progressId, "🌐 Translating prompt...");
    console.log("[edit.js] step: translating prompt:", prompt);
    const englishPrompt = await translatePrompt(prompt);
    console.log("[edit.js] step: translated prompt:", englishPrompt);

    await editMsg(api, progressId, `🤖 Processing with AI...\n📝 ${englishPrompt}`);
    console.log("[edit.js] step: picking model");
    const model = await pickModel();
    console.log("[edit.js] step: model selected:", model.slug);

    console.log("[edit.js] step: submitting edit job to deAPI");
    const requestId = await submitEditJob({ imageBuffer, prompt: englishPrompt, model });
    console.log("[edit.js] step: job submitted, request_id =", requestId);

    await editMsg(api, progressId, "⏳ Please wait, rendering your edit...");
    const result = await pollJob(requestId);
    console.log("[edit.js] step: job done, result_url =", result.result_url);

    if (!result.result_url) {
      throw new Error("deAPI finished the job but returned no result file.");
    }

    await editMsg(api, progressId, "📥 Downloading result...");
    const resultBuffer = await downloadToBuffer(result.result_url);
    console.log("[edit.js] step: result downloaded, bytes =", resultBuffer.length);

    await fs.ensureDir(CACHE_DIR);
    outPath = path.join(CACHE_DIR, `${Date.now()}_edited.jpg`);
    await fs.writeFile(outPath, resultBuffer);

    if (progressId) {
      try {
        await api.unsendMessage(progressId);
      } catch {
        /* best-effort */
      }
    }

    console.log("[edit.js] step: sending final edited image to Messenger");
    await api.sendMessage(
      { body: `✅ Image edited successfully.\n📝 ${englishPrompt}`, attachment: fs.createReadStream(outPath) },
      threadID,
      messageID,
      (err) => {
        if (err) console.error("[edit.js] sendMessage(final) error:", err);
        else console.log("[edit.js] step: final image sent successfully");
      }
    );
  } catch (err) {
    console.error("[edit.js] handleEditRequest failed:", err.response?.data || err.message || err);
    if (progressId) {
      try {
        await api.unsendMessage(progressId);
      } catch {
        /* best-effort */
      }
    }
    api.sendMessage(`❌ ${friendlyError(err)}`, threadID, messageID, (err2) => {
      if (err2) console.error("[edit.js] sendMessage(error-notice) error:", err2);
    });
  } finally {
    if (outPath && (await fs.pathExists(outPath))) {
      await fs.remove(outPath).catch(() => {});
    }
  }
}

/** Map raw errors to short, user-friendly Messenger text. */
function friendlyError(err) {
  const status = err.response?.status;
  const apiMsg = err.response?.data?.message;

  if (status === 401) return "Invalid or missing deAPI key. Please check DEAPI_API_KEY.";
  if (status === 422) return `Invalid request: ${apiMsg || "please check your image or prompt."}`;
  if (status === 429) return "Rate limited by deAPI — please try again in a moment.";
  if (/timed out|ETIMEDOUT|ECONNABORTED/i.test(err.message)) return "The request timed out. Please try again.";
  if (/ENOTFOUND|ECONNREFUSED|network/i.test(err.message)) return "Network error while reaching deAPI. Please try again.";
  if (/download/i.test(err.message)) return "Couldn't download the image. Please try replying to a different photo.";
  if (/Image-to-Image models/i.test(err.message)) return "No image editing models are available right now. Try again later.";
  if (/timed out waiting/i.test(err.message)) return "The edit took too long and timed out. Please try again.";

  return err.message || "Something went wrong while editing the image.";
}
