module.exports = {
	config: {
		name: "pending",
		aliases: ["pen", "approve", "পেন্ডিং"],
		version: "1.7",
		author: "MahMUD",
		countDown: 10,
		role: 0,
		description: "View and approve pending group requests for the bot (Admin)",
		category: "utility",
		guide: "{pn}: Use to see pending list. Then reply with the index number."
	},

	onStart: async function ({ api, event, replyManager, usersData }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			const spam = await api.getThreadList(100, null, ["OTHER"]) || [];
			const pend = await api.getThreadList(100, null, ["PENDING"]) || [];
			const list = [...spam, ...pend].filter(g => g.isSubscribed && g.isGroup);

			if (list.length === 0) {
				if (hasReaction) api.setMessageReaction("🥺", messageID, () => {}, true);
				return api.sendMessage("× No groups in pending queue! 😴", threadID, messageID);
			}

			let msg = `📋 Total Pending: ${list.length}\n`;
			list.forEach((g, i) => msg += `${i + 1}. ${g.name || "Unknown Group"} (${g.threadID})\n`);
			msg += "\n• Reply with index number to approve (Ex: 1 2 3)";

			return api.sendMessage(msg, threadID, (err, info) => {
				if (!err && info?.messageID && replyManager) {
					replyManager.set(info.messageID, {
						commandName: this.config.name,
						author: event.senderID,
						pending: list
					});
				}
			}, messageID);

		} catch (err) {
			console.error("Pending Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	},

	onReply: async function ({ api, event, Reply, usersData }) {
		const { threadID, messageID } = event;
		const hasReaction = typeof api.setMessageReaction === "function";

		const { author, pending } = Reply;
		if (String(event.senderID) !== String(author)) return;

		const index = event.body.split(/\s+/);
		let count = 0;

		try {
			if (hasReaction) api.setMessageReaction("⏳", messageID, () => {}, true);
			const user = await usersData.getUser(event.senderID);
			const name = user?.name || "Admin";

			for (const i of index) {
				if (isNaN(i) || i <= 0 || i > pending.length) continue;

				const target = pending[i - 1];
				await api.sendMessage("Bot is now connected! Use !help to see commands. ✨", target.threadID);
				await api.sendMessage(`This group was approved by ${name}.`, target.threadID);
				count++;
			}

			if (hasReaction) api.setMessageReaction("✅", messageID, () => {}, true);
			return api.sendMessage(`✅ Successfully approved ${count} group(s).`, threadID, messageID);

		} catch (err) {
			console.error("Pending Approve Error:", err);
			if (hasReaction) api.setMessageReaction("❌", messageID, () => {}, true);
			return api.sendMessage(`× API error: ${err.message}. Contact MahMUD for help.`, threadID, messageID);
		}
	}
};
