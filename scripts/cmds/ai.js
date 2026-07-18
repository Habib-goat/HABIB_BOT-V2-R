// AI.js
// Image Editing Command using official xAI Grok Imagine API for Riyad Bot

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); // For handling downloads

module.exports = {
    config: {
        name: "ai",
        aliases: [],
        version: "1.0.0",
        author: "Grok",
        countDown: 10,
        role: 0,
        description: "Edit images using official xAI Grok Imagine API",
        category: "ai",
        guide: {
            en: "Reply to an image and use: /ai <instruction>\nExample: /ai hd\n/ai make it cinematic"
        }
    },

    onStart: async function ({ api, event, args }) {
        const prompt = args.join(" ").trim();

        // Check if message is a reply to an image
        if (!event.messageReply || !event.messageReply.attachments || event.messageReply.attachments.length === 0) {
            return api.sendMessage("❌ Please reply to an image to use this command.\n\nExample:\nReply to photo → /ai hd", event.threadID, event.messageID);
        }

        const attachment = event.messageReply.attachments[0];
        if (attachment.type !== "photo") {
            return api.sendMessage("❌ Please reply to a photo/image only.", event.threadID, event.messageID);
        }

        if (!prompt) {
            return api.sendMessage("❌ Please provide an editing instruction.\n\nExample: /ai hd\n/ai remove background\n/ai anime style", event.threadID, event.messageID);
        }

        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const inputPath = path.join(tempDir, `input_${Date.now()}.jpg`);
        const outputPath = path.join(tempDir, `output_${Date.now()}.jpg`);

        try {
            api.sendMessage("⏳ Downloading image and processing with Grok Imagine...", event.threadID, event.messageID);

            // Download the image
            await downloadImage(attachment.url, inputPath);

            // Convert to base64 for xAI API
            const imageBase64 = fs.readFileSync(inputPath, { encoding: 'base64' });
            const dataUri = `data:image/jpeg;base64,${imageBase64}`;

            // Call xAI API
            const apiKey = process.env.XAI_API_KEY;
            if (!apiKey) {
                throw new Error("XAI_API_KEY environment variable is not set.");
            }

            const response = await axios.post('https://api.x.ai/v1/images/edits', {
                model: "grok-imagine-image-quality",
                prompt: prompt,
                image: {
                    url: dataUri,
                    type: "image_url"
                },
                response_format: "url"
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data || !response.data.data || !response.data.data[0] || !response.data.data[0].url) {
                throw new Error("No image URL returned from API");
            }

            const editedUrl = response.data.data[0].url;

            // Download the edited image
            await downloadImage(editedUrl, outputPath);

            // Send the result
            await api.sendMessage({
                body: `✅ Edited with Grok Imagine\n\nPrompt: ${prompt}`,
                attachment: fs.createReadStream(outputPath)
            }, event.threadID, event.messageID);

        } catch (error) {
            console.error("AI Command Error:", error.response?.data || error.message);
            
            let errorMsg = "❌ Failed to edit image.\n\n";
            
            if (error.response?.status === 401) {
                errorMsg += "API key error. Check XAI_API_KEY.";
            } else if (error.response?.status === 429) {
                errorMsg += "Rate limit reached. Try again later.";
            } else {
                errorMsg += "Please try again or check your prompt.";
            }
            
            api.sendMessage(errorMsg, event.threadID, event.messageID);
        } finally {
            // Cleanup temporary files
            try {
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
        }
    }
};

// Helper: Download image from URL
async function downloadImage(url, filepath) {
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}
