const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Get your key from https://api.bluesminds.com/console (Token Manager)
const BLUESMINDS_API_KEY = "sk-KDSePwoZD2KYdl8VV3rwBP57PHNpX8e7ctWHIrcZxhjYSCXM";
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

module.exports = {
	config: {
		name: "bluesai",
		aliases: ["bmai", "bluesmind", "hey"],
		version: "1.1.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		category: "ai",
		guide: "{pn} <question>: Ask the default model\n"
			+ "   {pn} model: List all available models\n"
			+ "   {pn} model <model-name> <question>: Ask a specific model\n"
			+ "   {pn} image <prompt>: Generate an image (default model)\n"
			+ "   {pn} image <model-name> <prompt>: Generate an image with a specific model\n"
			+ "   Reply to the bot's answer to continue the conversation (same model)"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;

		// bluesai model  → list models
		// bluesai model <name> <question> → use specific model
		if (args[0] === "model") {
			if (args.length === 1) {
				return this.listModels({ api, event });
			}
			const modelName = args[1];
			const prompt = args.slice(2).join(" ");
			if (!prompt) {
				return api.sendMessage(`× Please provide a question too.\nExample: bluesai model ${modelName} what is 2+2?`, threadID, messageID);
			}
			return this.handleAI({ api, event, prompt, model: modelName, replyManager });
		}

		// bluesai image <prompt>
		// bluesai image <model-name> <prompt>
		if (args[0] === "image") {
			const rest = args.slice(1);
			if (!rest.length) {
				return api.sendMessage("× Please provide an image prompt.\nExample: bluesai image a cat riding a bicycle", threadID, messageID);
			}
			// If the 2nd word looks like a model id we recognize, treat it as model; otherwise treat all as prompt.
			// Simplify: "bluesai image <model> - <prompt>" pattern avoids ambiguity.
			let model = DEFAULT_IMAGE_MODEL;
			let prompt = rest.join(" ");
			if (rest[0] && rest[0].includes("-") === false && rest.length > 1 && rest[1] !== "-" && /^[a-zA-Z0-9._]+$/.test(rest[0]) && rest.join(" ").includes(" - ")) {
				// pattern: image <model> - <prompt>
				const dashIndex = rest.indexOf("-");
				model = rest[0];
				prompt = rest.slice(dashIndex + 1).join(" ");
			}
			return this.handleImage({ api, event, prompt, model });
		}

		// bluesai <question> → default model
		const prompt = args.join(" ");
		if (!prompt) {
			return api.sendMessage(
				"× Baby, please ask something!\n"
				+ "Example: bluesai What is the capital of France?\n"
				+ "Type 'bluesai model' to see all available models.\n"
				+ "Type 'bluesai image <prompt>' to generate an image.",
				threadID, messageID
			);
		}
		return this.handleAI({ api, event, prompt, model: DEFAULT_CHAT_MODEL, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		// Keep using the same model the conversation started with
		const model = Reply.model || DEFAULT_CHAT_MODEL;
		return this.handleAI({ api, event, prompt, model, replyManager });
	},

	listModels: async function ({ api, event }) {
		const { threadID, messageID } = event;
		try {
			const res = await axios.get(`${BLUESMINDS_BASE}/models`, {
				headers: { "Authorization": `Bearer ${BLUESMINDS_API_KEY}` },
				timeout: 20000
			});

			const models = res.data?.data?.map(m => m.id) || [];
			if (!models.length) {
				return api.sendMessage("× Couldn't fetch model list right now.", threadID, messageID);
			}

			const header = `📋 Available Models (${models.length}):\n\n`;
			const footer = `\n\nℹ️ Chat:  bluesai model <name> <question>\nℹ️ Image: bluesai image <name> - <prompt>`;

			let current = header;
			const chunks = [];
			for (const m of models) {
				if ((current + `• ${m}\n`).length > 1800) {
					chunks.push(current);
					current = "";
				}
				current += `• ${m}\n`;
			}
			if (current) chunks.push(current + footer);

			for (const c of chunks) {
				await api.sendMessage(c, threadID, messageID);
			}
			return;

		} catch (err) {
			console.error("BluesAI Model List Error:", err.response?.data || err.message);
			return api.sendMessage(`× API error: ${err.response?.data?.error?.message || err.message}`, threadID, messageID);
		}
	},

	handleAI: async function ({ api, event, prompt, model, replyManager }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const response = await axios.post(
				`${BLUESMINDS_BASE}/chat/completions`,
				{
					model: model,
					messages: [{ role: "user", content: prompt }]
				},
				{
					headers: {
						"Authorization": `Bearer ${BLUESMINDS_API_KEY}`,
						"Content-Type": "application/json"
					},
					timeout: 60000
				}
			);

			const replyText = response.data?.choices?.[0]?.message?.content || "No response received.";
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage(`${replyText}\n\n— 🤖 ${model}`, threadID, (error, info) => {
				if (!error && info?.messageID && replyManager) {
					replyManager.set(info.messageID, {
						commandName: "bluesai",
						author: event.senderID,
						model: model
					});
				}
			}, messageID);

		} catch (err) {
			console.error("BluesAI Command Error:", err.response?.data || err.message);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			const errorMsg = err.response?.data?.error?.message || err.message;
			return api.sendMessage(`× API error (model: ${model}): ${errorMsg}`, threadID, messageID);
		}
	},

	handleImage: async function ({ api, event, prompt, model }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const cacheDir = path.join(__dirname, "cache");
		if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
		const filePath = path.join(cacheDir, `bluesai_img_${Date.now()}.png`);

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			const response = await axios.post(
				`${BLUESMINDS_BASE}/images/generations`,
				{
					model: model,
					prompt: prompt,
					n: 1,
					size: "1024x1024"
				},
				{
					headers: {
						"Authorization": `Bearer ${BLUESMINDS_API_KEY}`,
						"Content-Type": "application/json"
					},
					timeout: 120000
				}
			);

			const imageData = response.data?.data?.[0];
			if (!imageData) throw new Error("No image data returned from API.");

			if (imageData.b64_json) {
				fs.writeFileSync(filePath, Buffer.from(imageData.b64_json, "base64"));
			} else if (imageData.url) {
				const imgRes = await axios.get(imageData.url, { responseType: "arraybuffer", timeout: 60000 });
				fs.writeFileSync(filePath, imgRes.data);
			} else {
				throw new Error("Unrecognized image response format.");
			}

			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			return api.sendMessage({
				body: `🎨 Generated with ${model}\nPrompt: ${prompt}`,
				attachment: fs.createReadStream(filePath)
			}, threadID, () => {
				if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			}, messageID);

		} catch (err) {
			console.error("BluesAI Image Error:", err.response?.data || err.message);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			const errorMsg = err.response?.data?.error?.message || err.message;
			return api.sendMessage(`× Image generation failed (model: ${model}): ${errorMsg}`, threadID, messageID);
		}
	}
};
