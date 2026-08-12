const axios = require("axios");

// Get your key from https://api.bluesminds.com/console (Token Manager)
const BLUESMINDS_API_KEY = "sk-KDSePwoZD2KYdl8VV3rwBP57PHNpX8e7ctWHIrcZxhjYSCXM";
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";
const DEFAULT_MODEL = "gpt-4o";

module.exports = {
	config: {
		name: "bluesai",
		aliases: ["bmai", "bluesmind", "hey"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		category: "ai",
		guide: "{pn} <question>: Ask the default model\n"
			+ "   {pn} model: List all available models\n"
			+ "   {pn} model <model-name> <question>: Ask a specific model\n"
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

		// bluesai <question> → default model
		const prompt = args.join(" ");
		if (!prompt) {
			return api.sendMessage(
				"× Baby, please ask something!\n"
				+ "Example: bluesai What is the capital of France?\n"
				+ "Type 'bluesai model' to see all available models.",
				threadID, messageID
			);
		}
		return this.handleAI({ api, event, prompt, model: DEFAULT_MODEL, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		// Keep using the same model the conversation started with
		const model = Reply.model || DEFAULT_MODEL;
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

			const list = models.map(m => `• ${m}`).join("\n");
			const msg = `📋 Available Models (${models.length}):\n\n${list}\n\n`
				+ `ℹ️ Use: bluesai model <model-name> <question>`;

			// Messenger has a message length limit — split if too long
			if (msg.length > 4500) {
				const chunks = [];
				let current = `📋 Available Models (${models.length}):\n\n`;
				for (const m of models) {
					if ((current + `• ${m}\n`).length > 4500) {
						chunks.push(current);
						current = "";
					}
					current += `• ${m}\n`;
				}
				if (current) chunks.push(current);
				for (const c of chunks) {
					await api.sendMessage(c, threadID, messageID);
				}
				return api.sendMessage(`ℹ️ Use: bluesai model <model-name> <question>`, threadID, messageID);
			}

			return api.sendMessage(msg, threadID, messageID);

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
	}
};
