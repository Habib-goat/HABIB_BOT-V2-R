module.exports = {
	config: {
		name: "inbox",
		aliases: ["in", "ইনবক্স"],
		version: "1.9",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "Send a message to the user's inbox",
		category: "system",
		guide: "{pn}"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID, senderID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		// Try to DM the user's inbox directly, regardless of friend/inbox status
		api.sendMessage("Hi baby 😘", senderID, (err, info) => {
			if (err) {
				console.error("Inbox Error (DM to senderID):", err);
				if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			} else {
				console.log("Inbox DM sent successfully:", info?.messageID);
				if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			}
		});
	}
};
