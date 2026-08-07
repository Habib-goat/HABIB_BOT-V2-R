/**
 * @file image.js
 * @description Gemini Flash Image (gemini-2.5-flash-image) generation & editing command
 * @credits Riyad
 * @dependencies @google/genai, axios, fs-extra
 * @license MIT
 */

const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const MODEL_NAME = "gemini-2.5-flash-image";

const getApiKeys = () =>
	[
		process.env.GEMINI_API_KEY,
		process.env.GEMINI_API_KEY_1,
		process.env.GEMINI_API_KEY_2
	].filter(Boolean);

const isQuotaOrRateLimitError = (err) => {
	const msg = String(err?.message || err?.error?.message || "");
	const status = err?.status || err?.error?.code;
	return (
		status === 429 ||
		status === "RESOURCE_EXHAUSTED" ||
		msg.includes("RESOURCE_EXHAUSTED") ||
		msg.toLowerCase().includes("quota exceeded") ||
		msg.toLowerCase().includes("rate limit")
	);
};

const extractImageFromResponse = (response) => {
	const parts = response?.candidates?.[0]?.content?.parts || [];
	for (const part of parts) {
		if (part.inlineData && part.inlineData.data) {
			return {
				data: part.inlineData.data,
				mimeType: part.inlineData.mimeType || "image/png"
			};
		}
	}
	return null;
};

const mimeToExt = (mimeType) => {
	if (!mimeType) return "png";
	if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
	if (mimeType.includes("webp")) return "webp";
	return "png";
};

module.exports = {
	config: {
		name: "image",
		version: "1.0.0",
		hasPermission: 0,
		credits: "Riyad",
		description: "Generate or edit images using Gemini Flash Image (gemini-2.5-flash-image).",
		commandCategory: "AI Chat",
		usages: "<prompt> | reply to an image + <edit prompt>",
		cooldowns: 10
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const prompt = args.join(" ").trim();
		if (!prompt) {
			return api.sendMessage(
				"❌ Please provide a prompt.\n\nUsage: /image <prompt>\nExample: /image A futuristic cyberpunk city at night\n\nTip: Reply to a photo with /image <edit instructions> to edit it.",
				threadID,
				messageID
			);
		}

		const apiKeys = getApiKeys();
		if (!apiKeys.length) {
			return api.sendMessage(
				"❌ No Gemini API key configured. Please set GEMINI_API_KEY on the server.",
				threadID,
				messageID
			);
		}

		const repliedAttachment = event.messageReply?.attachments?.[0];
		const isEditMode = !!(repliedAttachment && repliedAttachment.type === "photo");

		const cacheDir = path.join(__dirname, "cache");
		await fs.ensureDir(cacheDir);
		const outputPath = path.join(cacheDir, `image_${Date.now()}_${threadID}.png`);

		let waitMsg;
		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			waitMsg = await api.sendMessage(
				isEditMode ? "🔄 | Editing your image, please wait..." : "🔄 | Generating your image, please wait...",
				threadID,
				messageID
			);

			let inlineImagePart = null;
			if (isEditMode) {
				try {
					const imgResponse = await axios.get(repliedAttachment.url, {
						responseType: "arraybuffer",
						timeout: 60000
					});
					const contentType = imgResponse.headers?.["content-type"] || "image/jpeg";
					inlineImagePart = {
						inlineData: {
							mimeType: contentType,
							data: Buffer.from(imgResponse.data).toString("base64")
						}
					};
				} catch (dlErr) {
					throw new Error("Failed to download the replied image. Please try again.");
				}
			}

			const contents = inlineImagePart
				? [{ parts: [inlineImagePart, { text: prompt }] }]
				: [{ parts: [{ text: prompt }] }];

			let response;
			let lastError;

			for (const apiKey of apiKeys) {
				try {
					const ai = new GoogleGenAI({ apiKey });
					response = await ai.models.generateContent({
						model: MODEL_NAME,
						contents
					});
					lastError = null;
					break;
				} catch (err) {
					lastError = err;
					if (isQuotaOrRateLimitError(err)) continue;
					throw err;
				}
			}

			if (!response) {
				if (lastError && isQuotaOrRateLimitError(lastError)) {
					throw new Error("All Gemini API keys have exceeded their quota. Please try again later.");
				}
				throw lastError || new Error("Gemini AI did not return a response.");
			}

			const image = extractImageFromResponse(response);
			if (!image) {
				const textOut = response?.text || response?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join(" ");
				throw new Error(textOut ? `Gemini did not return an image: ${textOut}` : "Gemini did not return an image.");
			}

			const finalPath = outputPath.replace(/\.png$/, `.${mimeToExt(image.mimeType)}`);
			await fs.writeFile(finalPath, Buffer.from(image.data, "base64"));

			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(
				{
					attachment: fs.createReadStream(finalPath)
				},
				threadID,
				() => {
					fs.remove(finalPath).catch(() => {});
				},
				messageID
			);
		} catch (error) {
			console.error("Image Command Error:", error);

			if (waitMsg?.messageID && typeof api.unsendMessage === "function") {
				try { api.unsendMessage(waitMsg.messageID); } catch (e) {}
			}
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);

			fs.remove(outputPath).catch(() => {});

			return api.sendMessage(
				`❌ Failed to ${isEditMode ? "edit" : "generate"} image.\nReason: ${error.message || "Unknown error occurred."}`,
				threadID,
				messageID
			);
		}
	}
};
