module.exports = {
	config: {
		name: "tid",
		version: "1.2",
		author: "Riyad",
		countDown: 5,
		role: 0,
		description: "View threadID of your group chat",
		category: "info",
		guide: "{pn}"
	},

	onStart: async function ({ api, event }) {
		const { threadID, messageID } = event;
		return api.sendMessage(threadID.toString(), threadID, messageID);
	}
};
