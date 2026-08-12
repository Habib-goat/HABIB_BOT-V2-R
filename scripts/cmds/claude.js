const axios = require("axios");

const LUMOSEL_BASE_URL = "https://api.lumosel.vip/v1";

// Text-capable models (pick any from the dashboard's "Available models" list)
const TEXT_MODEL = "claude-opus-4-8";
// Image-capable models are tagged "Image" on the dashboard
const IMAGE_MODEL = "gemini-3-pro-image";

module.exports = {
	config: {
		name: "claude",
		aliases: ["hi", "ask"],
		version: "1.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "Chat with Claude AI, or generate an image with '-img <prompt>'",
		category: "ai",
		guide: "{pn} <your question>\n{pn} -img <image description>"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;
		const apiKey = process.env.LUMOSEL_API_KEY;

		if (!apiKey) {
			return api.sendMessage(
				"⚠️ LUMOSEL_API_KEY টা .env ফাইলে সেট করা নেই। Railway/Termux-এ environment variable হিসেবে যোগ করো: LUMOSEL_API_KEY=lumo_live_7c135f2804daf1180da34b0baaa4e4fac9f37ca3",
				threadID,
				messageID
			);
		}

		if (!args[0]) {
			return api.sendMessage(
				"⚠️ কিছু লিখো তো!\nUsage:\nclaude <প্রশ্ন>\nclaude -img <ছবির বর্ণনা>",
				threadID,
				messageID
			);
		}

		const isImageRequest = args[0].toLowerCase() === "-img" || args[0].toLowerCase() === "-image";
		const prompt = (isImageRequest ? args.slice(1) : args).join(" ").trim();

		if (!prompt) {
			return api.sendMessage("⚠️ প্রম্পট খালি, কিছু একটা লিখো।", threadID, messageID);
		}

		if (typeof api.sendTypingIndicator === "function") {
			api.sendTypingIndicator(true, threadID, () => {}).catch(() => {});
		}

		try {
			if (isImageRequest) {
				await handleImageRequest({ api, threadID, messageID, apiKey, prompt });
			} else {
				await handleTextRequest({ api, threadID, messageID, apiKey, prompt });
			}
		} catch (err) {
			console.log("===== CLAUDE.JS ERROR =====");
			console.log(err.response ? err.response.data : err.message || err);
			console.log("============================");

			const errData = err.response && err.response.data && err.response.data.error;
			const errMsg = errData ? (errData.message || JSON.stringify(errData)) : (err.message || "Unknown error");

			return api.sendMessage("❌ Error: " + errMsg, threadID, messageID);
		} finally {
			if (typeof api.sendTypingIndicator === "function") {
				api.sendTypingIndicator(false, threadID, () => {}).catch(() => {});
			}
		}
	}
};

async function handleTextRequest({ api, threadID, messageID, apiKey, prompt }) {
	const res = await axios.post(
		`${LUMOSEL_BASE_URL}/chat/completions`,
		{
			model: TEXT_MODEL,
			messages: [{ role: "user", content: prompt }]
		},
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			timeout: 60000
		}
	);

	const reply = res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message
		? res.data.choices[0].message.content
		: null;

	if (!reply) {
		return api.sendMessage("⚠️ AI থেকে কোনো response পাওয়া যায়নি।", threadID, messageID);
	}

	return api.sendMessage(String(reply).trim(), threadID, messageID);
}

async function handleImageRequest({ api, threadID, messageID, apiKey, prompt }) {
	const res = await axios.post(
		`${LUMOSEL_BASE_URL}/chat/completions`,
		{
			model: IMAGE_MODEL,
			messages: [{ role: "user", content: prompt }]
		},
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			timeout: 90000
		}
	);

	const message = res.data && res.data.choices && res.data.choices[0] ? res.data.choices[0].message : null;

	// NOTE: the gateway's docs don't publish an exact schema for image
	// output, so we defensively check the common shapes a chat-completions
	// style image response might use. If none match, we fall back to
	// printing whatever text content came back (it may itself be a URL).
	const imageUrl =
		findImageUrl(message && message.content) ||
		(message && message.image_url) ||
		(message && message.images && message.images[0] && message.images[0].url) ||
		(message && message.images && message.images[0]);

	if (imageUrl) {
		return api.sendMessage(
			{ body: "🖼️ এই নাও:", attachment: await urlToStream(imageUrl) },
			threadID,
			messageID
		);
	}

	// Fallback: nothing recognizable as an image — show raw text so the
	// user (and we, for debugging) can see what actually came back.
	const rawText = message && typeof message.content === "string" ? message.content : JSON.stringify(message && message.content);
	return api.sendMessage(
		"⚠️ ছবি পাওয়া যায়নি, raw response:\n" + (rawText || "empty"),
		threadID,
		messageID
	);
}

// Looks for an image URL inside an OpenAI-style multi-part content array:
// [{ type: "image_url", image_url: { url: "..." } }, ...]
function findImageUrl(content) {
	if (!Array.isArray(content)) return null;
	for (const part of content) {
		if (part && part.type === "image_url" && part.image_url && part.image_url.url) return part.image_url.url;
		if (part && part.type === "output_image" && (part.url || part.image_url)) return part.url || part.image_url;
	}
	return null;
}

async function urlToStream(url) {
	// data:...;base64,.... URLs need decoding to a Buffer stream;
	// http(s) URLs can be streamed directly.
	if (url.startsWith("data:")) {
		const base64Data = url.split(",")[1];
		const { Readable } = require("stream");
		return Readable.from(Buffer.from(base64Data, "base64"));
	}
	const response = await axios.get(url, { responseType: "stream" });
	return response.data;
}
