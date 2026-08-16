// hgedit.js
// AI image enhancement/editing command using Hugging Face Inference Providers.
// Requires: npm install @huggingface/inference
// (axios is assumed to already be a dependency of the existing project.)
//
// Set HF_TOKEN in Railway Environment Variables. The token must have
// "Make calls to Inference Providers" permission.

const axios = require("axios");
const { Readable } = require("stream");
const { InferenceClient } = require("@huggingface/inference");

const MODEL_ID = "black-forest-labs/FLUX.1-Kontext-dev";

const DEFAULT_PROMPT = `Enhance the original photograph while preserving the exact scene,
composition, perspective, people, vehicles, road, trees and all existing
objects.

Make it look like a high-end realistic DSLR photograph.

Improve sharpness, fine details, dynamic range, realistic contrast,
natural lighting and image clarity.

Enhance the natural green vegetation and colors without oversaturation.

Create the realistic atmosphere of the moments immediately before heavy
rain: dramatic dark storm clouds, natural diffused light, subtle
moody atmosphere, realistic depth and cinematic but photorealistic
weather conditions.

Preserve the original identity and appearance of people and vehicles.

Do not add objects.
Do not remove objects.
Do not duplicate objects.
Do not change the composition.
Do not distort people or vehicles.
Do not make the image look like a painting, cartoon, anime or CGI.`;

const NEGATIVE_PROMPT =
  "cartoon, anime, painting, illustration, CGI, unrealistic colors, " +
  "oversaturated, blurry, low quality, distorted objects, deformed people, " +
  "extra people, extra vehicles, duplicated objects, changed composition, " +
  "artificial sky, fake lighting";

const REQUEST_TIMEOUT_MS = 90 * 1000;

function extractImageUrlFromAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  for (const att of attachments) {
    if (!att) continue;

    const type = att.type || att.attachmentType || "";
    if (type && !/photo|image|sticker/i.test(type)) continue;

    const candidateUrl =
      att.url ||
      att.source ||
      att.href ||
      (att.payload && (att.payload.url || att.payload.source)) ||
      null;

    if (candidateUrl && typeof candidateUrl === "string") {
      return candidateUrl;
    }
  }

  for (const att of attachments) {
    if (!att) continue;
    const candidateUrl =
      att.url ||
      att.source ||
      att.href ||
      (att.payload && (att.payload.url || att.payload.source)) ||
      null;
    if (candidateUrl && typeof candidateUrl === "string") {
      return candidateUrl;
    }
  }

  return null;
}

function findImageUrl(event) {
  const directUrl = extractImageUrlFromAttachments(event.attachments);
  if (directUrl) return directUrl;

  if (event.messageReply && Array.isArray(event.messageReply.attachments)) {
    const replyUrl = extractImageUrlFromAttachments(event.messageReply.attachments);
    if (replyUrl) return replyUrl;
  }

  return null;
}

function buildPrompt(customInstruction) {
  if (!customInstruction || !customInstruction.trim()) {
    return DEFAULT_PROMPT;
  }
  return `${DEFAULT_PROMPT}\n\nAdditional instruction from user (apply only as a stylistic adjustment, do not use it to add/remove/change objects, people identity, or composition): ${customInstruction.trim()}`;
}

function describeError(err) {
  const status =
    (err && err.httpResponse && err.httpResponse.status) ||
    (err && err.response && err.response.status) ||
    (err && err.status) ||
    null;

  let reason = "";
  if (status === 401) reason = "• Invalid or missing HF_TOKEN";
  else if (status === 403) reason = "• Permission/provider access issue with this token";
  else if (status === 404) reason = "• Model or provider currently unavailable";
  else if (status === 429) reason = "• Rate limit or free inference quota reached";
  else if (status && status >= 500) reason = "• Hugging Face provider/server error";
  else reason = "• Model temporarily unavailable\n• Image format unsupported\n• API timeout";

  return (
    "❌ Hugging Face AI image processing failed.\n\n" +
    "সম্ভব কারণ:\n" +
    reason +
    "\n\nকিছুক্ষণ পরে আবার চেষ্টা করুন।"
  );
}

module.exports = {
  config: {
    name: "hgedit",
    version: "1.0.0",
    author: "Riyad",
    role: 0,
    shortDescription: "AI image enhancement",
    longDescription: "Edit and enhance images using Hugging Face AI",
    category: "image",
    guide: "{pn}hgedit"
  },

  onStart: async ({ api, event, args }) => {
    const threadID = event.threadID;
    const messageID = event.messageID;

    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      return api.sendMessage(
        "❌ Hugging Face API token পাওয়া যায়নি।\nRailway Variables-এ HF_TOKEN সেট করুন।",
        threadID,
        messageID
      );
    }

    const imageUrl = findImageUrl(event);
    if (!imageUrl) {
      return api.sendMessage(
        "📸 একটি ছবি attach করুন অথবা ছবির message-এ reply করে /hgedit লিখুন।",
        threadID,
        messageID
      );
    }

    const customInstruction = Array.isArray(args) ? args.join(" ") : "";
    const finalPrompt = buildPrompt(customInstruction);

    try {
      await api.sendMessage(
        "⏳ AI image editing চলছে...\n\n" +
          "📸 Image received\n" +
          "🤖 Hugging Face AI processing...\n" +
          "🎨 Enhancing details and colors...\n\n" +
          "Please wait...",
        threadID
      );

      let imageBuffer;
      try {
        const downloadRes = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: REQUEST_TIMEOUT_MS
        });
        imageBuffer = Buffer.from(downloadRes.data);
      } catch (downloadErr) {
        return api.sendMessage(
          "❌ Hugging Face AI image processing failed.\n\n" +
            "সম্ভব কারণ:\n• মূল ছবিটি download করা যায়নি (invalid URL বা network issue)\n\n" +
            "কিছুক্ষণ পরে আবার চেষ্টা করুন।",
          threadID,
          messageID
        );
      }

      const client = new InferenceClient(hfToken);

      let resultBlob;
      try {
        resultBlob = await client.imageToImage({
          model: MODEL_ID,
          inputs: new Blob([imageBuffer]),
          parameters: {
            prompt: finalPrompt,
            negative_prompt: NEGATIVE_PROMPT
          }
        });
      } catch (hfErr) {
        console.error("Hugging Face inference error:", hfErr && hfErr.message ? hfErr.message : hfErr);
        return api.sendMessage(describeError(hfErr), threadID, messageID);
      }

      if (!resultBlob) {
        return api.sendMessage(describeError(new Error("empty response")), threadID, messageID);
      }

      const resultArrayBuffer = await resultBlob.arrayBuffer();
      const resultBuffer = Buffer.from(resultArrayBuffer);

      if (!resultBuffer || resultBuffer.length === 0) {
        return api.sendMessage(describeError(new Error("empty image buffer")), threadID, messageID);
      }

      const reportedType = (resultBlob.type || "").toLowerCase();
      const looksLikeImage = reportedType.startsWith("image/");
      const isSuspiciouslySmall = resultBuffer.length < 2048;

      if (!looksLikeImage || isSuspiciouslySmall) {
        let bodyPreview = "";
        try {
          bodyPreview = resultBuffer.toString("utf8").slice(0, 500);
        } catch (_) {
          bodyPreview = "(non-text binary payload)";
        }
        console.error(
          "hgedit: unexpected non-image response from Hugging Face.",
          "content-type:", reportedType || "(none)",
          "size:", resultBuffer.length,
          "body:", bodyPreview
        );
        return api.sendMessage(describeError(new Error(bodyPreview || "non-image response")), threadID, messageID);
      }

      const imageStream = Readable.from(resultBuffer);

      await api.sendMessage(
        {
          body:
            "✨ AI IMAGE EDIT COMPLETE\n\n" +
            "🤖 Model: Hugging Face AI\n" +
            "🎨 Enhancement: HD + Color + Cinematic\n" +
            "🌧️ Atmosphere: Pre-Rain\n\n" +
            "— Riyad Bot",
          attachment: imageStream
        },
        threadID,
        messageID
      );
    } catch (err) {
      console.error("hgedit unexpected error:", err && err.message ? err.message : err);
      return api.sendMessage(describeError(err), threadID, messageID);
    }
  }
};
