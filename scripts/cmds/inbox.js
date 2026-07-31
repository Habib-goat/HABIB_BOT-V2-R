module.exports = {
	config: {
		name: "inbox",
		aliases: ["in", "ইনবক্স"],
		version: "1.7",
		author: "MahMUD",
		countDown: 5,
		role: 0,
		description: "Send a message to the user's inbox",
		category: "system",
		guide: "{pn}"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID, senderID } = event;

		try {
			await api.sendMessage("Baby, check your inbox 🐤", threadID, messageID);
			await api.sendMessage("Hi baby 😘", senderID);

		} catch (error) {
			console.error("Inbox Error:", error);
			return api.sendMessage(`× API error: ${error.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
