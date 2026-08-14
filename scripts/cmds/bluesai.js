const axios = require("axios");

// Get your key from https://api.bluesminds.com/console (Token Manager)
const BLUESMINDS_API_KEY = "sk-KDSePwoZD2KYdl8VV3rwBP57PHNpX8e7ctWHIrcZxhjYSCXM";
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o";

// Confirmed working models on the current plan (verified manually / via checkmodels)
const WORKING_MODELS = [
	"gpt-4o",
	"gpt-5-mini",
	"gpt-5.2-chat",
	"qwen2.5",
	"deepseek-v4-flash",
	"mimo-v2.5",
	"meta/llama-3.1-8b-instruct",
	"meta/llama-3.2-3b-instruct",
	"z-ai/glm-5.2",
	"nvidia/nemotron-mini-4b-instruct",
	"nvidia/nemotron-3-super-120b-a12b",
	"nvidia/nemotron-3-nano-30b-a3b",
	"nvidia/llama-3.3-nemotron-super-49b-v1",
	"nvidia/llama-3.1-nemotron-nano-vl-8b-v1"
];

module.exports = {
	config: {
		name: "bluesai",
		aliases: ["bmai", "bluesmind", "hey"],
		version: "1.3.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		category: "ai",
		guide: "{pn} <question>: Ask the default model\n"
			+ "   {pn} model: List confirmed working models\n"
			+ "   {pn} model <model-name> <question>: Ask a specific model\n"
			+ "   Reply to the bot's answer to continue the conversation (same model)"
	},

	onStart: async function ({ api, event, args, replyManager }) {
		const { threadID, messageID } = event;

		// bluesai model  → list confirmed working models
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
			return api.sendMessage(this.buildHelpMessage(), threadID, messageID);
		}
		return this.handleAI({ api, event, prompt, model: DEFAULT_CHAT_MODEL, replyManager });
	},

	onReply: async function ({ api, event, Reply, replyManager }) {
		if (Reply.author !== event.senderID) return;
		const prompt = event.body;
		if (!prompt) return;

		const model = Reply.model || DEFAULT_CHAT_MODEL;
		return this.handleAI({ api, event, prompt, model, replyManager });
	},

	buildHelpMessage: function () {
		return "┏━━━━━━━━━━━━━━━━┓\n"
			+ "   🤖  𝗕𝗟𝗨𝗘𝗦 𝗔𝗜\n"
			+ "┗━━━━━━━━━━━━━━━━┛\n\n"
			+ "❔ Please ask something to get started!\n\n"
			+ "✦ 𝗤𝘂𝗶𝗰𝗸 𝗘𝘅𝗮𝗺𝗽𝗹𝗲\n"
			+ "   ➜ bluesai What is the capital of France?\n\n"
			+ "✦ 𝗠𝗼𝗿𝗲 𝗢𝗽𝘁𝗶𝗼𝗻𝘀\n"
			+ "   ➜ bluesai model\n"
			+ "      see available models\n"
			+ "   ➜ bluesai model <name> <question>\n"
			+ "      ask a specific model\n\n"
			+ "💬 Tip: reply to my answer to keep chatting\n"
			+ "     without typing the command again.";
	},

	listModels: async function ({ api, event }) {
		const { threadID, messageID } = event;

		const header = "┏━━━━━━━━━━━━━━━━━┓\n"
			+ "   📋 𝗔𝗩𝗔𝗜𝗟𝗔𝗕𝗟𝗘 𝗠𝗢𝗗𝗘𝗟𝗦\n"
			+ "┗━━━━━━━━━━━━━━━━━┛\n\n";

		const list = WORKING_MODELS.map((m, i) => `${i + 1}. ${m}`).join("\n");

		const footer = "\n\n✦ 𝗨𝘀𝗮𝗴𝗲\n"
			+ "   ➜ bluesai model <name> <question>";

		return api.sendMessage(header + list + footer, threadID, messageID);
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
