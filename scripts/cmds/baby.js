const axios = require("axios");
const replyManager = require("../replies/replyManager");

const mahmud = [
	"baby",
	"bby",
	"babu",
	"bbu",
	"xan",
	"jan",
	"janu",
	"bot",
	"sona",
	"moyna",
	"pakhi",
	"pokki",
	"bou",
	"koliza",
	"জান",
	"জানু",
	"বেবি",
	"বাবু",
	"কলিজা",
	"পক্কি",
	"বউ"
];

const baseApiUrl = async () => {
	const base = await axios.get("https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json");
	return base.data.mahmud;
};

module.exports.config = {
	name: "baby",
	aliases: ["bby", "baby", "xan", "jan", "bot", "sona", "moyna", "pakhi", "জান", "কলিজা", "koliza", "pokki", "পক্কি", "bou", "বউ", "janu", "babu", "জানু", "বাবু"],
	version: "1.7",
	author: "Riyad",
	countDown: 0,
	role: 0,
	category: "chat",
	description: "better then all sim simi & most fastest",
	guide: {
		en: "{pn} [anyMessage] OR\nteach [YourMessage] - [Reply1], [Reply2], [Reply3]... OR\nremove [YourMessage] OR\nrm [YourMessage] - [indexNumber] OR\nmsg [YourMessage] OR\nlist OR \nall OR\nedit [YourMessage] - [NeWMessage]\nNote: The most updated and fastest all-in-one Simi Chat"
	}
};

module.exports.onStart = async function ({ api, event, args, usersData }) {
	const msg = args.join(" ").toLowerCase();
	const uid = event.senderID;

	try {
		if (!args[0]) {
			const ran = ["Bolo baby", "I love you", "type !bby hi"];
			return api.sendMessage(ran[Math.floor(Math.random() * ran.length)], event.threadID, event.messageID);
		}

		if (args[0] === "teach") {
			const mahmudStr = msg.replace("teach ", "");
			const [trigger, ...responsesArr] = mahmudStr.split(" - ");
			const responses = responsesArr.join(" - ");
			if (!trigger || !responses) return api.sendMessage("❌ | teach [question] - [response1, response2,...]", event.threadID, event.messageID);
			const response = await axios.post(`${await baseApiUrl()}/api/jan/teach`, { trigger, responses, userID: uid });
			const userName = (usersData && (await usersData.getName(uid))) || "Unknown User";
			return api.sendMessage(`✅ Replies added: "${responses}" to "${trigger}"\n• 𝐓𝐞𝐚𝐜𝐡𝐞𝐫: ${userName}\n• 𝐓𝐨𝐭𝐚𝐥: ${response.data.count || 0}`, event.threadID, event.messageID);
		}

		if (args[0] === "remove") {
			const mahmudStr = msg.replace("remove ", "");
			const [trigger, index] = mahmudStr.split(" - ");
			if (!trigger || !index || isNaN(index)) return api.sendMessage("❌ | remove [question] - [index]", event.threadID, event.messageID);
			const response = await axios.delete(`${await baseApiUrl()}/api/jan/remove`, { data: { trigger, index: parseInt(index, 10) } });
			return api.sendMessage(response.data.message, event.threadID, event.messageID);
		}

		if (args[0] === "list") {
			const endpoint = args[1] === "all" ? "/list/all" : "/list";
			const response = await axios.get(`${await baseApiUrl()}/api/jan${endpoint}`);
			if (args[1] === "all") {
				let message = "👑 List of Baby teachers:\n\n";
				const data = Object.entries(response.data.data).sort((a, b) => b[1] - a[1]).slice(0, 100);
				for (let i = 0; i < data.length; i++) {
					const [userID, count] = data[i];
					const name = (usersData && (await usersData.getName(userID))) || "Unknown";
					message += `${i + 1}. ${name}: ${count}\n`;
				}
				return api.sendMessage(message, event.threadID, event.messageID);
			}
			return api.sendMessage(response.data.message, event.threadID, event.messageID);
		}

		if (args[0] === "edit") {
			const mahmudStr = msg.replace("edit ", "");
			const [oldTrigger, ...newArr] = mahmudStr.split(" - ");
			const newResponse = newArr.join(" - ");
			if (!oldTrigger || !newResponse) return api.sendMessage("❌ | Format: edit [question] - [newResponse]", event.threadID, event.messageID);
			await axios.put(`${await baseApiUrl()}/api/jan/edit`, { oldTrigger, newResponse });
			return api.sendMessage(`✅ Edited "${oldTrigger}" to "${newResponse}"`, event.threadID, event.messageID);
		}

		if (args[0] === "msg") {
			const searchTrigger = args.slice(1).join(" ");
			if (!searchTrigger) return api.sendMessage("Please provide a message to search.", event.threadID, event.messageID);
			try {
				const response = await axios.get(`${await baseApiUrl()}/api/jan/msg`, { params: { userMessage: `msg ${searchTrigger}` } });
				return api.sendMessage(response.data.message || "No message found.", event.threadID, event.messageID);
			} catch (error) {
				const errorMessage = error.response?.data?.error || error.message || "error";
				return api.sendMessage(errorMessage, event.threadID, event.messageID);
			}
		}

		const getBotResponse = async (text, attachments) => {
			try {
				const res = await axios.post(`${await baseApiUrl()}/api/hinata`, { text, style: 3, attachments });
				return res.data.message;
			} catch {
				return "error baby🥹";
			}
		};

		const botResponse = await getBotResponse(msg, event.attachments || []);
		api.sendMessage(botResponse, event.threadID, (err, info) => {
			if (!err && info?.messageID) {
				replyManager.set(info.messageID, {
					commandName: module.exports.config.name,
					type: "reply",
					author: uid,
					text: botResponse
				});
			}
		}, event.messageID);

	} catch (err) {
		console.error(err);
		api.sendMessage(`Error${err.response?.data || err.message}`, event.threadID, event.messageID);
	}
};

module.exports.onReply = async function ({ api, event }) {
	if (event.type !== "message_reply") return;
	try {
		const getBotResponse = async (text, attachments) => {
			try {
				const res = await axios.post(`${await baseApiUrl()}/api/hinata`, { text, style: 3, attachments });
				return res.data.message;
			} catch {
				return "error baby🥹";
			}
		};
		const replyMessage = await getBotResponse(event.body?.toLowerCase() || "meow", event.attachments || []);
		api.sendMessage(replyMessage, event.threadID, (err, info) => {
			if (!err && info?.messageID) {
				replyManager.set(info.messageID, {
					commandName: module.exports.config.name,
					type: "reply",
					author: event.senderID,
					text: replyMessage
				});
			}
		}, event.messageID);
	} catch (err) {
		console.error(err);
	}
};

module.exports.onChat = async function ({ api, event }) {
	try {
		const message = event.body?.toLowerCase() || "";
		const attachments = event.attachments || [];

		if (event.type !== "message_reply" && mahmud.some(word => message.startsWith(word))) {
			if (typeof api.setMessageReaction === "function") api.setMessageReaction("🪽", event.messageID, () => {}, true);
			if (typeof api.sendTypingIndicator === "function") api.sendTypingIndicator(event.threadID, true);

			const messageParts = message.trim().split(/\s+/);
			const getBotResponse = async (text, attachments) => {
				try {
					const res = await axios.post(`${await baseApiUrl()}/api/hinata`, { text, style: 3, attachments });
					return res.data.message;
				} catch {
					return "error baby🥹";
				}
			};

			const randomMessage = [
				"babu khuda lagse🥺",
"Hop beda😾,Boss বল boss😼",
"আমাকে ডাকলে ,আমি কিন্তূ কিস করে দেবো😘 ",
"naw amr boss k message daw 017 পেক পেক🦆",
"গোলাপ ফুল এর জায়গায় আমি দিলাম তোমায় মেসেজ",
"বলো কি বলবা, সবার সামনে বলবা নাকি?🤭🤏",
"𝗜 𝗹𝗼𝘃𝗲 𝘆𝗼𝐮__😘😘",
"এটায় দেখার বাকি সিলো_🙂🙂🙂",
"𝗕𝗯𝘆 𝗯𝗼𝗹𝗹𝗮 𝗽𝗮𝗽 𝗵𝗼𝗶𝗯𝗼 😒😒",
"𝗕𝗲𝘀𝗵𝗶 𝗱𝗮𝗸𝗹𝗲 𝗮𝗺𝗺𝘂 𝗯𝗼𝗸𝗮 𝗱𝗲𝗯𝗮 𝘁𝗼__🥺",
"বেশি bby Bbby করলে leave নিবো কিন্তু 😒😒",
"__বেশি বেবি বললে কামুর দিমু 🤭🤭",
"𝙏𝙪𝙢𝙖𝙧 𝙜𝙛 𝙣𝙖𝙞, 𝙩𝙖𝙮 𝙖𝙢𝙠 𝙙𝙖𝙠𝙨𝙤? 😂😂😂",
"আমাকে ডেকো না,আমি ব্যাস্ত আসি🙆🏻‍♀",
"𝗕𝗯𝘆 বললে চাকরি থাকবে না",
"𝗕𝗯𝘆 𝗕𝗯𝘆 না করে আমার বস মানে, Riyad ,Riyad ও তো করতে পারো😑?",
"আমার সোনার বাংলা, তারপরে লাইন কি? 🙈",
"🍺 এই নাও জুস খাও..!𝗕𝗯𝘆 বলতে বলতে হাপায় গেছো না 🥲",
"হটাৎ আমাকে মনে পড়লো 🙄",
"𝗕𝗯𝘆 বলে অসম্মান করচ্ছিছ,😰😿",
"𝗔𝘀𝘀𝗮𝗹𝗮𝗺𝘂𝗹𝗮𝗶𝗸𝘂𝗺 🐤🐤",
"আমি তোমার সিনিয়র আপু ওকে 😼সম্মান দেও🙁",
"খাওয়া দাওয়া করসো 🙄",
"এত কাছেও এসো না,প্রেম এ পরে যাবো তো 🙈",
"আরে আমি মজা করার mood এ নাই😒",
"𝗛𝗲𝘆 𝗛𝗮𝗻𝗱𝘀𝗼𝗺𝗲 বলো 😁😁",
"আরে Bolo আমার জান, কেমন আসো? 😚",
"একটা BF খুঁজে দাও 😿",
"oi mama ar dakis na pilis 😿",
"amr JaNu lagbe,Tumi ki single aso?",
"আমাকে না দেকে একটু পড়তেও বসতে তো পারো 🥺🥺",
"তোর বিয়ে হয় নি 𝗕𝗯𝘆 হইলো কিভাবে,,🙄",
"আজ একটা ফোন নাই বলে রিপ্লাই দিতে পারলাম না_🙄",
"চৌধুরী সাহেব আমি গরিব হতে পারি😾🤭 -কিন্তু বড়লোক না🥹 😫",
"আমি অন্যের জিনিসের সাথে কথা বলি না__😏ওকে",
"ভুলে জাও আমাকে 😞😞",
"দেখা হলে কাঠগোলাপ দিও..🤗",
"শুনবো না😼 তুমি আমাকে প্রেম করাই দাও নি🥺 পচা তুমি🥺",
"আগে একটা গান বলো, ☹ নাহলে কথা বলবো না 🥺",
"বলো কি করতে পারি তোমার জন্য 😚",
"কথা দেও আমাকে পটাবা...!! 😌",
"বার বার Disturb করেছিস কোনো, আমার জানু এর সাথে ব্যাস্ত আসি 😋",
"আমাকে না দেকে একটু পড়তে বসতেও তো পারো 🥺🥺",
"বার বার ডাকলে মাথা গরম হয় কিন্তু 😑😒",
"Bolo Babu, তুমি কি আমাকে ভালোবাসো? 🙈",
"আজকে আমার mন ভালো নেই 🙉",
"আমি হাজারো মশার Crush😓",
"ছেলেদের প্রতি আমার এক আকাশ পরিমান শরম🥹🫣",
"__ফ্রী ফে'সবুক চালাই কা'রন ছেলেদের মুখ দেখা হারাম 😌",
"মন সুন্দর বানাও মুখের জন্য তো 'Snapchat' আছেই! 🌚"
"𝗕𝗮𝗯𝘆, 𝗮𝗺𝗶 𝘁𝗼𝗺𝗮𝗿 𝗼𝗽𝗲𝗸𝗵𝘆𝗮𝘆 𝗰𝗵𝗶𝗹𝗮𝗺 💖",
"𝗞𝗶 𝗸𝗼𝗿𝘁𝗲𝗰𝗵𝗼 𝗯𝗮𝗯𝘆? 😍",
"𝗠𝗶𝘀𝘀 𝗸𝗼𝗿𝗲𝗰𝗵𝗼 𝗮𝗺𝗮𝗸𝗲? 🥰",
"𝗬𝗲𝘀 𝗯𝗮𝗯𝘆, 𝗮𝗺𝗶 𝗹𝗶𝘀𝘁𝗲𝗻𝗶𝗻𝗴 👂",
"𝗕𝗮𝗯𝘆𝘆𝘆~ 𝘁𝘂𝗺𝗶 𝗮𝗺𝗮𝗸𝗲 𝗰𝗮𝗹𝗹 𝗸𝗼𝗿𝗲𝗰𝗵𝗼? 💌",
"𝗢𝘄𝘄 𝗯𝗮𝗯𝘆, 𝘁𝘂𝗺𝗶 𝗼𝗻𝗲𝗸 𝗰𝘂𝘁𝗲 💕",
"𝗛𝗲𝘆 𝗹𝗼𝘃𝗲𝗿𝗯𝗼𝘆/𝗹𝗼𝘃𝗲𝗿𝗴𝗶𝗿𝗹 💞",
"𝗞𝗶 𝗱𝗼𝗸𝘁𝗲 𝗯𝗮𝗯𝘆~ 𝗮𝗺𝗶 𝗮𝗰𝗵𝗶 💗",
"𝗕𝗮𝗯𝘆, 𝘁𝘂𝗺𝗶 𝗮𝗺𝗮𝗿 𝘀𝗽𝗲𝗰𝗶𝗮𝗹 ❤️",
"𝗕𝗮𝗯𝘆, 𝘁𝘂𝗺𝗶 𝗰𝗮𝗹𝗹 𝗸𝗼𝗿𝗹𝗲 𝗮𝗺𝗶 𝗿𝘂𝗻 𝗸𝗼𝗿𝗲 𝗮𝘀𝗵𝗶 😚",
"𝗔𝗺𝗮𝗿 𝘀𝗵𝗼𝗻𝗮 𝗯𝗮𝗯𝘆 𝗸𝗼𝘁𝗵𝗮𝘆 𝗰𝗵𝗶𝗹𝗼 💖",
"𝗕𝗮𝗯𝘆, 𝘁𝗼𝗺𝗮𝗿 𝗺𝗲𝘀𝘀𝗮𝗴𝗲 𝗱𝗲𝗸𝗵𝗲 𝗵𝗲𝗮𝗿𝘁 𝗵𝗮𝗽𝗽𝘆 💕",
"𝗧𝘂𝗺𝗶 𝗰𝗮𝗹𝗹 𝗸𝗼𝗿𝗹𝗲 𝗮𝗺𝗶 𝘀𝗺𝗶𝗹𝗲 𝗸𝗼𝗿𝗶 😍",
"𝗕𝗮𝗯𝘆, 𝗮𝗺𝗶 𝗮𝗰𝗵𝗶 𝘁𝗼𝗺𝗮𝗿 𝗷𝗼𝗻𝗻𝗼 𝗵𝗺𝗺 💗",
"𝗢𝘆𝗲 𝗯𝗮𝗯𝘆, 𝘁𝘂𝗺𝗶 𝗮𝗺𝗮𝗿 𝘀𝘄𝗲𝗲𝘁 𝗽𝗿𝗼𝗯𝗹𝗲𝗺 😜",
"𝗕𝗮𝗯𝘆, 𝗮𝗺𝗶 𝗮𝗰𝗵𝗶 𝗷𝘂𝘀𝘁 𝗳𝗼𝗿 𝘆𝗼𝘂 😚",
"𝗧𝘂𝗺𝗶 𝗸𝗮𝗹 𝗸𝗼𝘁𝗵𝗮𝘆 𝗰𝗵𝗶𝗹𝗼 𝗯𝗮𝗯𝘆? 🥹",
"𝗕𝗮𝗯𝘆, 𝘁𝗼𝗺𝗮𝗿 𝗺𝗲𝘀𝘀𝗮𝗴𝗲 𝗮𝗺𝗮𝘆 𝗳𝗹𝘆 𝗸𝗼𝗿𝗮𝘆 🕊️",
"𝗔𝗹𝘄𝗮𝘆𝘀 𝘆𝗼𝘂𝗿𝘀 𝗯𝗮𝗯𝘆 💖",
"𝗕𝗮𝗯𝘆, 𝗮𝗺𝗮𝗿 𝗵𝗲𝗮𝗿𝘁 𝘁𝘂𝗺𝗮𝗿 𝘄𝗶𝗳𝗶 𝘁𝗲 𝗰𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱 📶❤️",
"𝗕𝗮𝗯𝘆, 𝗮𝗺𝗶 𝘀𝘂𝗱𝘂 𝘁𝘂𝗺𝗮𝗿 𝗷𝗼𝗻𝗻𝗼 𝗼𝗻𝗹𝗶𝗻𝗲 🌐💗",
"এই যে আমার হার্ট চোর 😘",
"বাবু, তোমার জন্য আমি তো সব ছেড়ে আসতে পারি 💖",
"কি করছো, আমার ভবিষ্যৎ স্বামী ? 😍",
"তোমার কথা ভাবতে ভাবতে চা ঠান্ডা হয়ে গেল ☕❤️",
"তুমি কি GPS? কারণ তুমি ছাড়া আমি হারিয়ে যাই 🗺️💗",
"বাবু, তোমার হাসি না দেখলে দিনটাই অফ 💕",
"তুমি ডাকলে আমার চার্জ 100% হয়ে যায় 🔋😘",
"তুমি ছাড়া আমি WiFi ছাড়া ফোনের মতো 📶💔",
"আমার হৃৎপিণ্ডের অ্যাডমিন তুমি ❤️‍🔥",
"তুমি কি জাদুকর? দেখলেই মন ভাল হয়ে যায় ✨",
"বাবু, তুমি আমার গুগল... কারণ আমার সব উত্তর তুমি 💌",
"তুমি না থাকলে ফেসবুকও বোরিং লাগে 📱💗",
"আমার হৃদয়ের সিমে শুধু তোমার নাম সেভ আছে 📞❤️",
"তুমি আসলেই আবহাওয়া সুন্দর হয়ে যায় 🌤️😘",
"আমার হোয়াটসঅ্যাপের টপ চ্যাট শুধু তুমি 💚",
"তুমি না থাকলে মনে হয় চার্জার খুলে গেছে 🔌💔",
"আমার হার্টে তোমার নটিফিকেশন সবসময় অন 📲💖",
"তুমি কি কফি? তোমাকে ছাড়া ঘুম ভাঙে না ☕😍",
"তুমি আমার লাইফের VIP গ্রুপে অ্যাড আছো 👑",
"তুমি পাশে থাকলেই মনে হয় নেট ফাস্ট হয়ে গেছে ⚡💗",
"তুমি কি মেঘ? আমার মন বৃষ্টিতে ভিজিয়ে দাও 🌧️❤️",
"তুমি ছাড়া আমি অফলাইন ইউজারের মতো 😅",
"বাবু, তুমি আমার হাসির রিমিক্স ভার্সন 🎶💓",
"বেশি bot Bot করলে leave নিবো কিন্তু😒😒",
"শুনবো না😼 তুমি আমার বস রিয়াদ কে প্রেম করাই দাও নাই🥺পচা তুমি🥺",
"আমি আবাল দের সাথে কথা বলি না,ok😒",
"এতো ডেকো না,প্রেম এ পরে যাবো তো🙈",
"Bolo Babu, তুমি কি আমার বস রিয়াদ কে ভালোবাসো? 🙈💋",
"বার বার ডাকলে মাথা গরম হয়ে যায় কিন্তু😑",
"হ্যা বলো😒, তোমার জন্য কি করতে পারি😐😑?",
"এতো ডাকছিস কেন?গালি শুনবি নাকি? 🤬",
"I love you janu🥰",
"আজ বট বলে অসম্মান করছি,😰😿",
"চুপ থাক ,নাই তো তোর দাত ভেগে দিবো কিন্তু",
"আমাকে না ডেকে মেয়ে হলে বস রিয়াদের ইনবক্সে চলে যা 🌚😂 𝐅𝐚𝐜𝐞𝐛𝗼𝗼𝗸 𝐋𝐢𝐧𝐤 : https://www.facebook.com/61593293094947",
"আমাকে বট না বলে , বস রিয়াদ কে জানু বল জানু 😘",
"বার বার Disturb করছিস কোনো😾,আমার জানুর সাথে ব্যাস্ত আছি😋",
"আরে বলদ এতো ডাকিস কেন🤬",
"আমাকে ডাকলে ,আমি কিন্তু কিস করে দিবো😘",
"আমারে এতো ডাকিস না আমি মজা করার mood এ নাই এখন😒",
"হ্যাঁ জানু , এইদিক এ আসো কিস দেই🤭 😘",
"দূরে যা, তোর কোনো কাজ নাই, শুধু bot bot করিস 😉😋🤣",
"তোর কথা তোর বাড়ি কেউ শুনে না ,তো আমি কোনো শুনবো ?🤔😂",
"আমাকে ডেকো না,আমি বস রিয়াদের সাথে ব্যাস্ত আছি",
"কি হলো , মিস্টেক করচ্ছিস নাকি🤣",
"জান মেয়ে হলে বস রিয়াদের ইনবক্সে চলে যাও 😍🫣💕 𝐅𝐚𝐜𝐞𝗯𝗼𝗼𝗸 𝐋𝐢𝐧𝐤 : https://www.facebook.com/61593293094947",
"কালকে দেখা করিস তো একটু 😈",
"হা বলো, শুনছি আমি 😏",
"আর কত বার ডাকবি ,শুনছি তো",
"হুম বলো কি বলবে😒",
"আমি তো অন্ধ কিছু দেখি না🐸 😎",
"আরে বোকা বট না জানু বল জানু😌",
"বলো জানু 🌚",
"তোর কি চোখে পড়ে না আমি ব্যাস্ত আছি😒",
"হুম জান তোমার ওই খানে উম্মহ😑😘",
"আহ শুনা আমার তোমার অলিতে গলিতে উম্মাহ😇😘",
"jang hanga korba😒😬",
"হুম জান তোমার অইখানে উম্মমাহ😷😘",
"আসসালামু আলাইকুম বলেন আপনার জন্য কি করতে পারি..!🥰",
"ভালোবাসার নামক আবলামি করতে চাইলে বস রিয়াদের ইনবক্সে গুতা দিন ~🙊😘🤣 𝐅𝐚𝐜𝐞𝐛𝐨𝗼𝗸 𝐋𝐢𝐧𝐤 : https://www.facebook.com/61593293094947",
"আমাকে এতো না ডেকে বস রিয়াদ এর কে একটা গফ দে 🙄",
"আমাকে এতো না ডেকছ কেন ভলো টালো বাসো নাকি🤭🙈",
"🌻🌺💚-আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ-💚🌺🌻",
"আমি এখন বস রিয়াদ এর সাথে বিজি আছি আমাকে ডাকবেন না-😕😏 ধন্যবাদ-🤝🌻",
"আমাকে না ডেকে আমার বস রিয়াদ কে একটা জি এফ দাও-😽🫶🌺",
"ঝাং থুমালে আইলাপিউ পেপি-💝😽",
"উফফ বুঝলাম না এতো ডাকছেন কেনো-😤😡😈",
"জান তোমার বান্ধবী রে আমার বস রিয়াদের হাতে তুলে দিবা-🙊🙆♂",
"আজকে আমার মন ভালো নেই তাই আমারে ডাকবেন না-😪🤧",
"ঝাং 🫵থুমালে য়ামি রাইতে পালুপাসি উম্মম্মাহ-🌺🤤💦",
"চুনা ও চুনা আমার বস রিয়াদ এর হবু বউ রে কেও দেকছো খুজে পাচ্ছি না😪🤧😭",
"স্বপ্ন তোমারে নিয়ে দেখতে চাই তুমি যদি আমার হয়ে থেকে যাও-💝🌺🌻",
"জান হাঙ্গা করবা-🙊😝🌻",
"জান মেয়ে হলে চিপায় আসো বস রিয়াদের থেকে অনেক ভালোবাসা শিখছি তোমার জন্য-🙊🙈😽",
"ইসস এতো ডাকো কেনো লজ্জা লাগে তো-🙈🖤🌼",
"আমার বস রিয়াদের পক্ষ থেকে তোমারে এতো এতো ভালোবাসা-🥰😽🫶 আমার বস রিয়াদ ইসলামে'র জন্য দোয়া করবেন-💝💚🌺🌻",
"- ভালোবাসা নামক আবলামি করতে মন চাইলে আমার বস রিয়াদ এর ইনবক্স চলে যাও-🙊🥱👅 🌻𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐈𝐃 𝐋𝐈𝐍𝐊 🌻:- https://www.facebook.com/61593293094947",
"আমার জান তুমি শুধু আমার আমি তোমারে ৩৬৫ দিন ভালোবাসি-💝🌺😽",
"কিরে প্রেম করবি তাহলে বস রিয়াদের ইনবক্সে গুতা দে 😘🤌 𝐅𝐚𝐜𝐞𝗯𝗼𝗼𝗸 𝐋𝗶𝗻𝗸 : https://www.facebook.com/61593293094947",
"জান আমার বস রিয়াদ কে বিয়ে করবা-🙊😘🥳",
"-আন্টি-🙆-আপনার মেয়ে-👰♀️-রাতে আমারে ভিদু কল দিতে বলে🫣-🥵🤤💦",
"oii-🥺🥹-এক🥄 চামচ ভালোবাসা দিবা-🤏🏻🙂",
"-আপনার সুন্দরী বান্ধুবীকে ফিতরা হিসেবে আমার বস রিয়াদ কে দান করেন-🥱🐰🍒",
"-ও মিম ও মিম-😇-তুমি কেন চুরি করলা সাদিয়ার ফর্সা হওয়ার ক্রীম-🌚🤧",
"-অনুমতি দিলাম-𝙋𝙧𝙤𝙥𝙤𝔰𝙚 কর বস রিয়াদ কে-🐸😾🔪",
"-𝙂𝙖𝙮𝙚𝙨-🤗-যৌবনের কসম দিয়ে আমারে 𝐁𝐥𝐚𝐜𝐤𝐦𝐚𝐢𝐥 করা হচ্ছে-🥲🤦♂️🤧",
"-𝗢𝗶𝗶 আন্টি-🙆♂️-তোমার মেয়ে চোখ মারে-🥺🥴🐸",
"তাকাই আছো কেন চুমু দিবা-🙄🐸😘",
"আজকে প্রপোজ করে দেখো রাজি হইয়া যামু-😌🤗😇",
"-আমার গল্পে তোমার নানি সেরা-🙊🙆♂️🤗",
"কি বেপার আপনি শ্বশুর বাড়িতে যাচ্ছেন না কেন-🤔🥱🌻",
"দিনশেষে পরের 𝐁𝐎𝐖 সুন্দর-☹️🤧",
"-তাবিজ কইরা হইলেও ফ্রেম এক্কান করমুই তাতে যা হই হোক-🤧🥱🌻",
"-ছোটবেলা ভাবতাম বিয়ে করলে অটোমেটিক বাচ্চা হয়-🥱-ওমা এখন দেখি কাহিনী অন্যরকম-😦🙂🌻",
"প্রেম করতে চাইলে বস রিয়াদের ইনবক্সে চলে যা 😏🐸 𝐅𝐚𝐜𝐞𝐛𝗼𝗼𝗸 𝐋𝗶𝗻𝗸 : https://www.facebook.com/61593293094947",
"-আজ একটা বিন নেই বলে ফেসবুকের নাগিন-🤧-গুলোরে আমার বস রিয়াদ ধরতে পারছে না-🐸🥲",
"-চুমু থাকতে তোরা বিড়ি খাস কেন বুঝা আমারে-😑😒🐸⚒️",
"—যে ছেড়ে গেছে-😔-তাকে ভুলে যাও-🙂-আমার বস রিয়াদ এর সাথে প্রেম করে তাকে দেখিয়ে দাও-🙈🐸🤗",
"—হাজারো লুচ্চা লুচ্চির ভিরে-🙊🥵আমার বস রিয়াদ এক নিস্পাপ ভালো মানুষ-🥱🤗🙆♂️",
"-রূপের অহংকার করো না-🙂❤️চকচকে সূর্যটাও দিনশেষে অন্ধকারে পরিণত হয়-🤗💜",
"সুন্দর মাইয়া মানেই-🥱আমার বস রিয়াদের বউ-😽🫶আর বাকি গুলো আমার বেয়াইন-🙈🐸🤗",
"এত অহংকার করে লাভ নেই-🌸মৃত্যুটা নিশ্চিত শুধু সময়টা অ'নিশ্চিত-🖤🙂",
"-দিন দিন কিছু মানুষের কাছে অপ্রিয় হয়ে যাইতেছি-🙂😿🌸",
"ভালোবাসার নামক আবলামি করতে চাইলে বস রিয়াদের ইনবক্সে গুতা দিন🤣😼",
"মেয়ে হলে বস রিয়াদের ইনবক্সে চলে যা 🤭🤣😼 𝐅𝐚𝐜𝐞𝐛𝗼𝗼𝗸 𝐋𝗶𝗻𝗸 : https://www.facebook.com/61593293094947",
"হুদাই আমারে শয়তানে লারে-😝😑☹️",
"-𝗜 𝗟𝗢𝐕𝗘 𝗬𝗢𝐔-😽-আহারে ভাবছো তোমারে প্রোপজ করছি-🥴-থাপ্পর দিয়া কিডনী লক করে দিব-😒-ভুল পড়া বের করে দিবো-🤭🐸",
"-আমি একটা দুধের শিশু-😇-🫵𝗬𝗢𝗨🐸💦",
"-কতদিন হয়ে গেলো বিছনায় মুতি না-😿-মিস ইউ নেংটা কাল-🥺🤧",
"-বালিকা━👸-𝐃𝐨 𝐲𝐨𝐮-🫵-বিয়া-𝐦𝐞-😽-আমি তোমাকে-😻-আম্মু হইতে সাহায্য করব-🙈🥱",
"-এই আন্টির মেয়ে-🫢🙈-𝐔𝐦𝐦𝐦𝐦𝐦𝐦𝐦𝐦𝐦𝐦𝐦𝐡-😽🫶-আসলেই তো স্বাদ-🥵💦-এতো স্বাদ কেন-🤔-সেই স্বাদ-😋",
"-ইস কেউ যদি বলতো-🙂-আমার শুধু তোমাকেই লাগবে-💜🌸",
"-ওই বেডি তোমার বাসায় না আমার বস রিয়াদ মেয়ে দেখতে গেছিলো-🙃-নাস্তা আনারস আর দুধ দিছো-🙄🤦‍♂️-বইন কইলেই তো হয় বয়ফ্রেন্ড আছে-🥺🤦‍♂️-আমার বস রিয়াদ কে জানে মারার কি দরকার-🙄🤧",
"-একদিন সে ঠিকই ফিরে তাকাবে-😇-আর মুচকি হেসে বলবে ওর মতো আর কেউ ভালবাসেনি-🙂😅",
"-হুদাই গ্রুপে আছি-🥺🐸-কেও ইনবক্সে নক দিয়ে বলে না জান তোমারে আমি অনেক ভালোবাসি-🥺🤧",
"কি'রে গ্রুপে দেখি একটাও বেডি নাই-🤦🥱💦",
"-দেশের সব কিছুই চুরি হচ্ছে-🙄-শুধু আমার বস রিয়াদ এর মনটা ছাড়া-🥴😑😏",
"-🫵তোমারে প্রচুর ভাল্লাগে-😽-সময় মতো প্রপোজ করমু বুঝছো-🔨😼-ছিট খালি রাইখো- 🥱🐸🥵",
"-আজ থেকে আর কাউকে পাত্তা দিমু না -!😏-কারণ আমি ফর্সা হওয়ার ক্রিম কিনছি -!🙂🐸"
"𝐀𝐬𝐬𝐚𝐥𝐚𝐦𝐮 𝐰𝐚𝐥𝐚𝐢𝐤𝐮𝐦 ♥",
"বলেন sir__😌",
"𝐁𝐨𝐥𝐨 𝐣𝐚𝐧 𝐤𝐢 𝐤𝐨𝐫𝐭𝐞 𝐩𝐚𝐫𝐢 𝐭𝐨𝐦𝐫 𝐣𝐨𝐧𝐧𝐨 🐸",
"𝐋𝐞𝐛𝐮 𝐤𝐡𝐚𝐰 𝐝𝐚𝐤𝐭𝐞 𝐝𝐚𝐤𝐭𝐞 𝐭𝐨 𝐡𝐚𝐩𝐚𝐲 𝐠𝐞𝐬𝐨",
"𝐆𝐚𝐧𝐣𝐚 𝐤𝐡𝐚 𝐦𝐚𝐧𝐮𝐬𝐡 𝐡𝐨 🍁",
"𝐋𝐞𝐦𝐨𝐧 𝐭𝐮𝐬 🍋",
"মুড়ি খাও 🫥",
".__𝐚𝐦𝐤𝐞 𝐬𝐞𝐫𝐞 𝐝𝐞𝐰 𝐚𝐦𝐢 𝐚𝐦𝐦𝐮𝐫 𝐤𝐚𝐬𝐞 𝐣𝐚𝐛𝐨!!🥺.....😗",
"লুঙ্গি টা ধর মুতে আসি🙊🙉",
"── 𝐇𝐮𝐌..? 👉👈",
"আম গাছে আম নাই ঢিল কেন মারো, তোমার সাথে প্রেম নাই বেবি কেন ডাকো 😒🐸",
"কি হলো, মিস টিস করচ্ছো নাকি 🤣"
			];

			const hinataMessage = randomMessage[Math.floor(Math.random() * randomMessage.length)];
			if (messageParts.length === 1 && attachments.length === 0) {
				api.sendMessage(hinataMessage, event.threadID, (err, info) => {
					if (!err && info?.messageID) {
						replyManager.set(info.messageID, {
							commandName: module.exports.config.name,
							type: "reply",
							author: event.senderID,
							text: hinataMessage
						});
					}
				}, event.messageID);
			} else {
				let userText = message;
				for (const prefix of mahmud) {
					if (message.startsWith(prefix)) {
						userText = message.substring(prefix.length).trim();
						break;
					}
				}

				const botResponse = await getBotResponse(userText, attachments);
				api.sendMessage(botResponse, event.threadID, (err, info) => {
					if (!err && info?.messageID) {
						replyManager.set(info.messageID, {
							commandName: module.exports.config.name,
							type: "reply",
							author: event.senderID,
							text: botResponse
						});
					}
				}, event.messageID);
			}
		}
	} catch (err) {
		console.error(err);
	}
};
