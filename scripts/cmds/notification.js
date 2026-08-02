module.exports = {
	config: {
		name: "notification",
		aliases: ["notify", "noti"],
		version: "1.0",
		author: "Riyad",
		countDown: 5,
		role: 2, // admin/owner only
		description: "Send a notification message from admin to all group chats",
		category: "owner",
		guide: "{pn} <message>"
	},

	onStart: async function ({ api, event, args, threadsData }) {
		const { threadID, messageID } = event;

		if (!args[0]) {
			return api.sendMessage("❌ | Please enter the message you want to send to all groups.", threadID, messageID);
		}

		const body = `˗ˏˋ⎯୧ 𝗔𝗗𝗠𝗜𝗡⚡𝗠𝗘𝗦𝗦𝗔𝗚𝗘 ୨⎯ˎˊ˗\n︵‿︵‿╰⊱ 𝗕𝗢𝗧⚡𝗥𝗜𝗬𝗔𝗗 ⊰╯‿︵‿︵\n${args.join(" ")}`;

		// Pull every known group thread from the database
		const allThreads = await threadsData.getAllThreads();
		const groupThreadIDs = allThreads.map((t) => t.id).filter(Boolean);

		if (groupThreadIDs.length === 0) {
			return api.sendMessage("❌ | No group threads found in the database.", threadID, messageID);
		}

		api.sendMessage(`⏳ Sending notification to ${groupThreadIDs.length} chat groups...`, threadID, messageID);

		const delayPerGroup = 250;
		let sendSuccess = 0;
		const sendErrors = [];

		for (const tid of groupThreadIDs) {
			try {
				await new Promise((resolve, reject) => {
					api.sendMessage(body, tid, (err) => {
						if (err) reject(err);
						else resolve();
					});
				});
				sendSuccess++;
			} catch (e) {
				sendErrors.push({ threadID: tid, error: e?.message || String(e) });
			}
			await new Promise((resolve) => setTimeout(resolve, delayPerGroup));
		}

		let msg = "";
		if (sendSuccess > 0) {
			msg += `✅ Sent notification to ${sendSuccess} group(s) successfully.\n`;
		}
		if (sendErrors.length > 0) {
			msg += `⚠️ Failed to send to ${sendErrors.length} group(s):\n`;
			msg += sendErrors.slice(0, 10).map((e) => ` - ${e.threadID}: ${e.error}`).join("\n");
			if (sendErrors.length > 10) {
				msg += `\n ...and ${sendErrors.length - 10} more.`;
			}
		}

		api.sendMessage(msg, threadID, messageID);
	}
};
