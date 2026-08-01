module.exports = {
	config: {
		name: "inbox",
		aliases: ["in", "ইনবক্স"],
		version: "2.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "Send a message to the user's inbox",
		category: "system",
		guide: "{pn}"
	},

	onStart: async function ({ api, event }) {
		const { messageID, senderID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const trySend = () => new Promise((resolve) => {
			api.sendMessage("Hi baby 😘", senderID, (err, info) => {
				// Some fca-eryxenx MQTT puback bugs cause err=null but info
				// missing/empty even though the message never really sent.
				// Only trust it as a real success if we got a messageID back.
				if (!err && info && info.messageID) {
					resolve({ ok: true });
				} else {
					resolve({ ok: false, err: err || new Error("No messageID returned (likely MQTT puback issue)") });
				}
			});
		});

		let result;
		const maxAttempts = 3;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			result = await trySend();
			if (result.ok) break;

			console.error(`Inbox DM attempt ${attempt} failed:`, result.err);
			if (attempt < maxAttempts) {
				await new Promise((r) => setTimeout(r, 1500 * attempt));
			}
		}

		if (result.ok) {
			console.log("Inbox DM confirmed sent with valid messageID.");
			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
		} else {
			console.error("Inbox DM failed after all retries:", result.err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
		}
	}
};
