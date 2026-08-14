const axios = require("axios");

// Same key as bluesai.js — keep them in sync
const BLUESMINDS_API_KEY = "sk-KDSePwoZD2KYdl8VV3rwBP57PHNpX8e7ctWHIrcZxhjYSCXM";
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";

// Delay between each test call so we don't hit rate limits (20 RPM on free tier ≈ 1 call/3s)
const DELAY_MS = 3200;

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
	config: {
		name: "checkmodels",
		aliases: ["checkai", "modelcheck"],
		version: "1.0.0",
		author: "Riyad",
		countDown: 30,
		role: 0,
		category: "ai",
		guide: "{pn}: Tests every available model and reports which ones actually work for your account.\n"
			+ "   ⚠️ This can take several minutes for 100+ models — it sends one request per model with delays to respect rate limits."
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);

			// 1. Get the full model list
			const modelsRes = await axios.get(`${BLUESMINDS_BASE}/models`, {
				headers: { "Authorization": `Bearer ${BLUESMINDS_API_KEY}` },
				timeout: 20000
			});
			const models = modelsRes.data?.data?.map(m => m.id) || [];

			if (!models.length) {
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
				return api.sendMessage("× Couldn't fetch model list.", threadID, messageID);
			}

			const estMinutes = Math.ceil((models.length * DELAY_MS) / 60000);
			await api.sendMessage(
				`🔍 Testing ${models.length} models one by one...\n`
				+ `⏱️ This will take roughly ${estMinutes} minute(s). I'll send the results when done.`,
				threadID, messageID
			);

			// 2. Test each model with a minimal, cheap prompt
			const working = [];
			const failed = [];

			for (let i = 0; i < models.length; i++) {
				const model = models[i];
				try {
					const res = await axios.post(
						`${BLUESMINDS_BASE}/chat/completions`,
						{
							model: model,
							messages: [{ role: "user", content: "hi" }],
							max_tokens: 5
						},
						{
							headers: {
								"Authorization": `Bearer ${BLUESMINDS_API_KEY}`,
								"Content-Type": "application/json"
							},
							timeout: 20000
						}
					);

					const gotReply = !!res.data?.choices?.[0]?.message?.content;
					if (gotReply) {
						working.push(model);
					} else {
						failed.push({ model, reason: "empty response" });
					}
				} catch (err) {
					const reason = err.response?.data?.error?.message || err.message;
					failed.push({ model, reason: reason.slice(0, 60) });
				}

				// Progress ping every 20 models so the chat doesn't look dead
				if ((i + 1) % 20 === 0) {
					await api.sendMessage(`… tested ${i + 1}/${models.length} so far (${working.length} working)`, threadID);
				}

				if (i < models.length - 1) await sleep(DELAY_MS);
			}

			// 3. Report results
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);

			let resultMsg = `✅ Working Models (${working.length}/${models.length}):\n\n`;
			resultMsg += working.map(m => `• ${m}`).join("\n") || "(none)";

			// Split into chunks under Messenger's length limit
			const chunks = [];
			let current = "";
			for (const line of resultMsg.split("\n")) {
				if ((current + line + "\n").length > 1800) {
					chunks.push(current);
					current = "";
				}
				current += line + "\n";
			}
			if (current) chunks.push(current);

			for (const c of chunks) {
				await api.sendMessage(c, threadID);
			}

			await api.sendMessage(`❌ ${failed.length} models failed or unavailable on your current plan.`, threadID);

		} catch (err) {
			console.error("CheckModels Error:", err.response?.data || err.message);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× Error: ${err.response?.data?.error?.message || err.message}`, threadID, messageID);
		}
	}
};
