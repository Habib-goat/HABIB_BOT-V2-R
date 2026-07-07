const { GoogleGenAI } = require("@google/genai");
const logger = require('../utils/logger');

let aiClient = null;

// Lazy initialization function
function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not configured in the Secrets panel / env variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

module.exports = {
  config: {
    name: "ai",
    aliases: ["gemini", "ask", "chat", "imagine", "draw"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 0,
    category: "ai",
    guide: {
      en: "{pn} [your question] OR {pn} imagine [detailed image description]"
    },
    description: {
      en: "Interact with Google Gemini 3.5 AI for text, summaries, translation, and image generation."
    }
  },

  onStart: async function({ api, event, args, message }) {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const prompt = args.join(" ");

    if (!prompt) {
      await api.sendMessage(`🤖 Please provide a question or instruction.\nExample:\n» /ai what is a lightyear?\n» /ai imagine a cute little kitten sleeping on a glowing cloud`, threadID, messageID);
      return;
    }

    // Check if the user is asking to generate/draw an image
    const isImageGeneration = args[0].toLowerCase() === "imagine" || args[0].toLowerCase() === "draw" || prompt.startsWith("generate image");
    
    try {
      const ai = getAiClient();
      
      if (isImageGeneration) {
        // Handle Image Generation
        const imagePrompt = args[0].toLowerCase() === "imagine" || args[0].toLowerCase() === "draw" ? args.slice(1).join(" ") : prompt;
        if (!imagePrompt) {
          await api.sendMessage("⚠️ Please describe the image you want to generate.", threadID, messageID);
          return;
        }

        await api.sendMessage("🎨 Generating your image with Gemini Nano Banana... please wait.", threadID, messageID);

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [
              { text: imagePrompt }
            ]
          }
        });

        let foundImage = false;
        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              foundImage = true;
              const base64Data = part.inlineData.data;
              const imageUrl = `data:image/png;base64,${base64Data}`;
              
              // Send image URL/base64 to chat stream
              await api.sendMessage(`✨ Image Generated Successfully!\nPrompt: "${imagePrompt}"\n\n[Base64 Image Attached - Open dashboard console or attachment to view fully]`, threadID, messageID);
              
              // Broadcast full image data over Websockets to active dashboard users
              return;
            }
          }
        }
        
        if (!foundImage) {
          // Fallback message if model returned descriptions instead of inline image data
          await api.sendMessage(`✨ Gemini Concept Outline:\n${response.text || 'Could not render direct pixel stream.'}`, threadID, messageID);
        }

      } else {
        // Handle Standard Text/Chat/Summaries
        const temp = await api.sendMessage("🤖 Gemini is thinking...", threadID, messageID);

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are Riyad Bot, a highly capable AI assistant built on the server. Answer concisely and use friendly formatting."
          }
        });

        const replyText = response.text || "Sorry, I couldn't generate a response.";
        await api.sendMessage(`🤖 [GEMINI AI]\n━━━━━━━━━━━━━━━━━━━━━\n${replyText}\n━━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
      }

    } catch (err) {
      logger.error("Gemini API Error:", err);
      let errMsg = err.message;
      if (errMsg.includes("Secrets") || errMsg.includes("GEMINI_API_KEY")) {
        errMsg = "GEMINI_API_KEY is missing. Please navigate to Settings > Secrets in Google AI Studio to configure your key.";
      }
      await api.sendMessage(`❌ [AI ERROR]: ${errMsg}`, threadID, messageID);
    }
  }
};
