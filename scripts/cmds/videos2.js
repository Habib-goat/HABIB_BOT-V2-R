const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
    config: {
        name: "videos2",
        version: "1.0.0",
        author: "Riyad", // আপনার নাম
        countDown: 5,
        role: 0,
        description: "Search videos and download",
        category: "media",
        guide: "{pn} <search query>"
    },

    onStart: async function ({ api, event, args, message }) {
        const query = args.join(" ");
        if (!query) return message.reply("❌ | Please provide a search query!\nExample: videos2 funny cat");

        try {
            // API কল করা হচ্ছে
            const apiUrl = `https://videos2-api.onrender.com/search?query=${encodeURIComponent(query)}&pages=1`;
            const response = await axios.get(apiUrl);
            const data = response.data;

            // API থেকে আসা ডেটা স্ট্রাকচার হ্যান্ডেল করার জন্য
            let results = [];
            if (Array.isArray(data)) {
                results = data;
            } else if (data && Array.isArray(data.results)) {
                results = data.results;
            } else if (data && Array.isArray(data.videos)) {
                results = data.videos;
            } else if (data && Array.isArray(data.data)) {
                results = data.data;
            }

            // প্রথম ৫টি ভিডিও নেওয়া হচ্ছে
            const videos = results.slice(0, 5);

            if (videos.length === 0) {
                return message.reply("❌ | No videos found for your query.");
            }

            // মেসেজ ফরম্যাট করা হচ্ছে
            let msgBody = "🔎 | Top 5 Search Results:\n\n";
            videos.forEach((v, i) => {
                const title = v.title || v.name || "Unknown Title";
                msgBody += `${i + 1}. ${title}\n`;
            });
            msgBody += "\n👉 Reply to this message with a number (1-5) to get the video.";

            const msg = await message.reply(msgBody);
            
            // onReply হুকের জন্য ডেটা সেভ করা হচ্ছে (GoatBot V2 & ST-BOT supported)
            if (global.RiyadBot && global.RiyadBot.onReply) {
    global.RiyadBot.onReply.set(msg.messageID, {
        commandName: this.config.name,
        messageID: msg.messageID,
        authorID: event.senderID,
        videos
    });
}
        } catch (err) {
            console.error(err);
            return message.reply("❌ | The video search API is currently unavailable or returned an error. Please try again later.");
        }
    },

    // রিপ্লাই হ্যান্ডলার (ST-BOT বা Modified GoatBot এর জন্য অটোমেটিক কাজ করবে)
    onReply: async function ({ message, Reply, event, api }) {
        if (!Reply) return;
        
        // শুধুমাত্র যে ইউজার সার্চ করেছে সে-ই রিপ্লাই দিতে পারবে
        if (event.senderID !== Reply.authorID) return;

        const choice = parseInt(event.body);
        if (isNaN(choice) || choice < 1 || choice > Reply.videos.length) {
            return message.reply("❌ | Invalid choice. Please reply with a number between 1 and " + Reply.videos.length + ".");
        }

        const selectedVideo = Reply.videos[choice - 1];
        const videoUrl = selectedVideo.url || selectedVideo.link || selectedVideo.download_url;

        if (!videoUrl) {
            return message.reply(`▶️ | No direct download URL found for: ${selectedVideo.title || "this video"}`);
        }

        await message.reply("⏳ | Downloading your video, please wait...");

        try {
            // ভিডিও স্ট্রিম করা হচ্ছে
            const stream = await axios({
                method: 'GET',
                url: videoUrl,
                responseType: 'stream'
            });

            // টেম্পোরারি ফোল্ডার সেটআপ
            const tmpDir = path.join(__dirname, "tmp");
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir);
            }
            const filePath = path.join(tmpDir, `video_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

            const writer = fs.createWriteStream(filePath);
            stream.data.pipe(writer);

            writer.on('finish', async () => {
                try {
                    await message.reply({
                        body: `▶️ | Here is your video: ${selectedVideo.title || ""}`,
                        attachment: fs.createReadStream(filePath)
                    });
                } catch (err) {
                    await message.reply(`❌ | Failed to send video attachment. Direct link: ${videoUrl}`);
                } finally {
                    // সার্ভারের জায়গা বাঁচাতে ফাইল ডিলিট করে দেওয়া হচ্ছে
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            });

            writer.on('error', async () => {
                await message.reply(`❌ | Error downloading the video. Direct link:\n${videoUrl}`);
            });

        } catch (err) {
            await message.reply(`❌ | Failed to fetch the video. Direct link:\n${videoUrl}`);
        }

        // কাজ শেষ, তাই onReply লিসেনার ডিলিট করে দেওয়া হচ্ছে
        if (global.RiyadBot && global.RiyadBot.onReply) {
    global.RiyadBot.onReply.delete(Reply.messageID);
}
    }
};
