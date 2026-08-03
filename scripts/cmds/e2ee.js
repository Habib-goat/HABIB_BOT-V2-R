module.exports = {
	config: {
		name: "e2ee",
		aliases: ["encrypt"],
		version: "1.0",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "Test end-to-end encrypted (E2EE) messaging",
		category: "system",
		guide: "{pn}: send an E2EE test message (only works inside an encrypted chat)"
	},

	onStart: async function ({ api, event, args }) {
		const { threadID, messageID } = event;

		if (!event.isE2EE) {
			return api.sendMessage(
				"⚠️ This command only works in E2EE (end-to-end encrypted) chats.",
				threadID,
				messageID
			);
		}

		if (typeof api.setMessageReaction === "function") {
			api.setMessageReaction("🔒", messageID, () => {}, true).catch(() => {});
		}

		if (typeof api.sendTypingIndicator === "function") {
			await api.sendTypingIndicator(true, threadID, () => {}).catch(() => {});
			await new Promise(resolve => setTimeout(resolve, 2000));
			await api.sendTypingIndicator(false, threadID, () => {}).catch(() => {});
		}

		return api.sendMessage(
			"🔒 E2EE Test\n━━━━━━━━━━━━━━━━\n" +
			"Your message is end-to-end encrypted.\n" +
			`• Thread: ${threadID}\n` +
			"• Bridge: Active ✅",
			threadID,
			messageID
		);
	}
};
