/**
 * Riyad Bot Framework - Fun & Games Built-in Commands Bundle
 * Programmatically registers 30 entertaining, interactive game and casual utility commands.
 */

const crypto = require('crypto');

const funCommands = [
  {
    config: {
      name: "joke",
      aliases: ["telljoke", "funny"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Tells a hilarious, lighthearted joke."
    },
    onStart: async ({ api, event }) => {
      const jokes = [
        "Why don't scientists trust atoms? Because they make up everything!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win an award? Because he was outstanding in his field!",
        "Why don't skeletons fight each other? They don't have the guts.",
        "What do you call a sleeping bull? A bulldozer!",
        "Why was the computer cold? It left its Windows open!",
        "What do you call cheese that isn't yours? Nacho cheese!",
        "Why are elevator jokes so classic? Because they work on so many levels!"
      ];
      const selected = jokes[Math.floor(Math.random() * jokes.length)];
      await api.sendMessage(`😂 **JOKE CORNER**:\n\n"${selected}"`, event.threadID);
    }
  },
  {
    config: {
      name: "quote",
      aliases: ["motivate", "wisdom"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Get an inspiring, motivational quote."
    },
    onStart: async ({ api, event }) => {
      const quotes = [
        { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
        { q: "Life is what happens when you're busy making other plans.", a: "John Lennon" },
        { q: "Get busy living or get busy dying.", a: "Stephen King" },
        { q: "You only live once, but if you do it right, once is enough.", a: "Mae West" },
        { q: "Whether you think you can or think you can't, you're right.", a: "Henry Ford" },
        { q: "The best way to predict your future is to create it.", a: "Abraham Lincoln" }
      ];
      const selected = quotes[Math.floor(Math.random() * quotes.length)];
      await api.sendMessage(`✍️ **INSPIRATIONAL QUOTE**:\n\n"${selected.q}"\n\n— *${selected.a}*`, event.threadID);
    }
  },
  {
    config: {
      name: "quiz",
      aliases: ["trivia"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 5,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Start a trivia quiz. Answer immediately using reply to get rewards."
    },
    onStart: async ({ api, event }) => {
      const questions = [
        { q: "What is the capital city of Australia?", a: "Canberra" },
        { q: "How many planets are there in our Solar System?", a: "8" },
        { q: "What is the chemical symbol for gold?", a: "Au" },
        { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci" },
        { q: "Which gas do plants absorb during photosynthesis?", a: "Carbon dioxide" },
        { q: "What is the largest ocean on Earth?", a: "Pacific Ocean" }
      ];
      
      const selection = questions[Math.floor(Math.random() * questions.length)];
      const botMsg = await api.sendMessage(`🧠 **TRIVIA QUIZ**\n\n• **Question:** ${selection.q}\n\n👉 *Reply to this message with your answer! Cooldown: 15s.*`, event.threadID);
      
      // Register reply handler for dynamic answer verification
      if (global.RiyadBot && global.RiyadBot.onReply) {
        global.RiyadBot.onReply.set(botMsg.messageID, {
          commandName: "quiz",
          correctAnswer: selection.a,
          authorID: event.senderID
        });
      }
    },
    onReply: async ({ api, event, replyData }) => {
      const ans = event.body.trim().toLowerCase();
      const correct = replyData.correctAnswer.toLowerCase();

      if (ans === correct) {
        await api.sendMessage(`🎉 **CORRECT!**\nOutstanding! You answered correctly: **${replyData.correctAnswer}**.\n💵 Awarded: \`💵 150 coins\`!`, event.threadID);
        // Reward user
        const database = require('../utils/database');
        const user = database.getUser(event.senderID);
        database.updateUser(event.senderID, { money: (user.money || 0) + 150 });
      } else {
        await api.sendMessage(`❌ **WRONG ANSWER!**\nOh no, that's incorrect. Try again next time!`, event.threadID);
      }
      global.RiyadBot.onReply.delete(event.messageReply.messageID);
    }
  },
  {
    config: {
      name: "math",
      aliases: ["solve"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [problem]",
      description: "Solves simple mathematical addition, subtraction, multiplication, division tasks."
    },
    onStart: async ({ api, event, args }) => {
      const problem = args.join("");
      if (!problem) return api.sendMessage("⚠️ Usage: `/math 25 * 4 + 10`", event.threadID);
      try {
        // Safe math evaluation
        const clean = problem.replace(/[^0-9+\-*/().]/g, '');
        const res = eval(clean);
        await api.sendMessage(`📊 **MATH RESOLUTION**\n• Problem: \`${problem}\`\n• Result: **${res}**`, event.threadID);
      } catch (err) {
        await api.sendMessage("❌ Invalid math expression.", event.threadID);
      }
    }
  },
  {
    config: {
      name: "rps",
      aliases: ["janken"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [rock | paper | scissors]",
      description: "Play Rock-Paper-Scissors against the bot."
    },
    onStart: async ({ api, event, args }) => {
      const pChoice = args[0] ? args[0].toLowerCase() : '';
      if (pChoice !== 'rock' && pChoice !== 'paper' && pChoice !== 'scissors') {
        return api.sendMessage("⚠️ Usage: `/rps [rock | paper | scissors]`", event.threadID);
      }

      const options = ['rock', 'paper', 'scissors'];
      const bChoice = options[Math.floor(Math.random() * 3)];
      
      let res = '';
      if (pChoice === bChoice) res = "It's a TIE!";
      else if (
        (pChoice === 'rock' && bChoice === 'scissors') ||
        (pChoice === 'paper' && bChoice === 'rock') ||
        (pChoice === 'scissors' && bChoice === 'paper')
      ) {
        res = "🎉 You WON! +50 coins!";
        const database = require('../utils/database');
        const user = database.getUser(event.senderID);
        database.updateUser(event.senderID, { money: (user.money || 0) + 50 });
      } else {
        res = "💀 You LOST! Better luck next time.";
      }

      await api.sendMessage(`✊✌️✋ **ROCK PAPER SCISSORS**\n` +
        `• Your Choice: **${pChoice.toUpperCase()}**\n` +
        `• Bot's Choice: **${bChoice.toUpperCase()}**\n\n` +
        `👉 **Result:** ${res}`, event.threadID);
    }
  },
  {
    config: {
      name: "truth",
      aliases: ["gettruth"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Gives an embarrassing truth prompt."
    },
    onStart: async ({ api, event }) => {
      const truths = [
        "What is the biggest lie you have ever told?",
        "Have you ever cheated on a test?",
        "Who in this group chat would you save first in a fire?",
        "What is your most embarrassing childhood nickname?",
        "What is the most childish thing you still do?"
      ];
      await api.sendMessage(`🤫 **TRUTH PROMPT**:\n\n"${truths[Math.floor(Math.random() * truths.length)]}"`, event.threadID);
    }
  },
  {
    config: {
      name: "dare",
      aliases: ["getdare"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Gives a daring physical challenge."
    },
    onStart: async ({ api, event }) => {
      const dares = [
        "Do 20 pushups right now!",
        "Send the most embarrassing photo in your camera roll to this group chat.",
        "Talk in an accent chosen by the next commenter for the next 15 minutes.",
        "Sing the chorus of your favorite song out loud and post a recording.",
        "Text your crush 'I like you' and screenshot the response."
      ];
      await api.sendMessage(`🔥 **DARE CHALLENGE**:\n\n"${dares[Math.floor(Math.random() * dares.length)]}"`, event.threadID);
    }
  },
  {
    config: {
      name: "ship",
      aliases: ["match", "love"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 4,
      role: 0,
      category: "fun",
      guide: "{pn} @name1 @name2",
      description: "Calculate standard matching compatibility score."
    },
    onStart: async ({ api, event, args }) => {
      const name1 = args[0] || "Hasan";
      const name2 = args[1] || "Riyad";
      const pct = Math.floor(Math.random() * 101);

      let msg = `💖 **COMPATIBILITY SHIP CARD** 💖\n` +
        `• Partner A: **${name1}**\n` +
        `• Partner B: **${name2}**\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📈 Compatibility: **${pct}%**\n`;

      if (pct > 85) msg += `👉 **Verdict:** Match made in heaven! 💒`;
      else if (pct > 60) msg += `👉 **Verdict:** Extremely high chemistry. 💕`;
      else if (pct > 35) msg += `👉 **Verdict:** Good friendship parameters. 👍`;
      else msg += `👉 **Verdict:** Toxic. Run away immediately! 🛑`;

      await api.sendMessage(msg, event.threadID);
    }
  },
  {
    config: {
      name: "crush",
      aliases: ["crushmeter"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [crush_name]",
      description: "Calculates how much your crush secretively values you."
    },
    onStart: async ({ api, event, args }) => {
      const crush = args.join(" ");
      if (!crush) return api.sendMessage("⚠️ Type your crush's name!", event.threadID);
      const val = Math.floor(Math.random() * 101);
      await api.sendMessage(`💘 **CRUSH RADAR**:\n\nHow much **${crush}** secretively likes you: **${val}%**!`, event.threadID);
    }
  },
  {
    config: {
      name: "roll",
      aliases: ["randomnumber"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} or {pn} [max]",
      description: "Rolls a random integer between 1 and a specified max range."
    },
    onStart: async ({ api, event, args }) => {
      const max = parseInt(args[0]) || 100;
      const roll = Math.floor(Math.random() * max) + 1;
      await api.sendMessage(`🎲 **DICE ROLL**: You rolled a **${roll}** (range: 1-${max})!`, event.threadID);
    }
  },
  {
    config: {
      name: "dice",
      aliases: ["craps"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Rolls two standard physical six-sided dice."
    },
    onStart: async ({ api, event }) => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      await api.sendMessage(`🎲 **DOUBLE DICE**: [ ${d1} ] [ ${d2} ]\n👉 Total Sum: **${d1 + d2}**`, event.threadID);
    }
  },
  {
    config: {
      name: "coin",
      aliases: ["flipcoin"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Simple coin flipper (Heads or Tails)."
    },
    onStart: async ({ api, event }) => {
      const res = Math.random() < 0.5 ? "HEADS" : "TAILS";
      await api.sendMessage(`🪙 **COIN FLIP**: The coin landed on **${res}**!`, event.threadID);
    }
  },
  {
    config: {
      name: "predict",
      aliases: ["8ball", "oracle"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [yes_no_question]",
      description: "Consult the supreme Oracle to answer your future path."
    },
    onStart: async ({ api, event, args }) => {
      const ques = args.join(" ");
      if (!ques) return api.sendMessage("⚠️ Ask the Oracle a question!", event.threadID);
      const answers = [
        "It is certain.", "Without a doubt.", "Yes, definitely.",
        "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
        "Don't count on it.", "My sources say no.", "Very doubtful."
      ];
      await api.sendMessage(`🔮 **ORACLE PREDICTION**:\n• Question: *${ques}*\n\n• **Response:** "${answers[Math.floor(Math.random() * answers.length)]}"`, event.threadID);
    }
  },
  {
    config: {
      name: "horoscope",
      aliases: ["zodiac"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [sign]",
      description: "Displays daily astrological horoscope predictions."
    },
    onStart: async ({ api, event, args }) => {
      const sign = args[0] ? args[0].toLowerCase() : 'aries';
      const signs = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
      if (!signs.includes(sign)) {
        return api.sendMessage("❌ Invalid sign. Choose a standard zodiac sign (e.g. Leo, Gemini).", event.threadID);
      }
      const forecasts = [
        "Excellent day to initiate new projects! Financial gates are swinging open.",
        "Focus on emotional security. Communication is key to locking partnerships.",
        "Your creative energy is bursting. Avoid hasty spending decisions.",
        "Health parameters look excellent. Focus on meditation and exercise."
      ];
      await api.sendMessage(`✨ **ZODIAC HOROSCOPE: ${sign.toUpperCase()}** ✨\n\n👉 **Forecast:** ${forecasts[Math.floor(Math.random() * forecasts.length)]}`, event.threadID);
    }
  },
  {
    config: {
      name: "lovecalculator",
      aliases: ["lovecalc"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [name_a] and [name_b]",
      description: "Determine love density levels."
    },
    onStart: async ({ api, event, args }) => {
      const score = Math.floor(Math.random() * 101);
      await api.sendMessage(`❤️ **LOVE CALCULATOR** ❤️\nCompatibility rating: **${score}%**!`, event.threadID);
    }
  },
  {
    config: {
      name: "ascii",
      aliases: ["asciify"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Convert short string input into fancy bubble styles."
    },
    onStart: async ({ api, event, args }) => {
      const input = args.join(" ");
      if (!input) return api.sendMessage("⚠️ Give some text!", event.threadID);
      const bubbles = input.toUpperCase().split("").map(c => `[${c}]`).join(" ");
      await api.sendMessage(`🔤 **BUBBLE ASCII**:\n\n\`\`\`\n${bubbles}\n\`\`\``, event.threadID);
    }
  },
  {
    config: {
      name: "binary",
      aliases: ["tobinary"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Converts text inputs into standard UTF-8 binary streams."
    },
    onStart: async ({ api, event, args }) => {
      const text = args.join(" ");
      if (!text) return api.sendMessage("⚠️ Usage: `/binary Hello`", event.threadID);
      const binary = text.split("").map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join(" ");
      await api.sendMessage(`🔢 **BINARY OUTPUT**:\n\n\`\`\`\n${binary}\n\`\`\``, event.threadID);
    }
  },
  {
    config: {
      name: "encode",
      aliases: ["base64"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Encode text to secure base64 strings."
    },
    onStart: async ({ api, event, args }) => {
      const text = args.join(" ");
      if (!text) return api.sendMessage("⚠️ Provide text to encode.", event.threadID);
      const enc = Buffer.from(text).toString('base64');
      await api.sendMessage(`🔏 **BASE64 ENCODED**:\n\`${enc}\``, event.threadID);
    }
  },
  {
    config: {
      name: "decode",
      aliases: ["unbase64"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [base64_string]",
      description: "Decode base64 strings back to clean readable text."
    },
    onStart: async ({ api, event, args }) => {
      const text = args[0];
      if (!text) return api.sendMessage("⚠️ Provide base64 string.", event.threadID);
      try {
        const dec = Buffer.from(text, 'base64').toString('utf8');
        await api.sendMessage(`🔓 **BASE64 DECODED**:\n\`${dec}\``, event.threadID);
      } catch (err) {
        await api.sendMessage("❌ Decode failed.", event.threadID);
      }
    }
  },
  {
    config: {
      name: "reverse",
      aliases: ["invert"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Flip text characters completely backwards."
    },
    onStart: async ({ api, event, args }) => {
      const text = args.join(" ");
      if (!text) return api.sendMessage("⚠️ Provide text.", event.threadID);
      const rev = text.split("").reverse().join("");
      await api.sendMessage(`🔄 **REVERSED TEXT**:\n\`${rev}\``, event.threadID);
    }
  },
  {
    config: {
      name: "countwords",
      aliases: ["wc"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Count total words, letters, and characters."
    },
    onStart: async ({ api, event, args }) => {
      const text = args.join(" ");
      if (!text) return api.sendMessage("⚠️ Give me text parameters.", event.threadID);
      const words = text.split(/\s+/).filter(w => w.length > 0).length;
      await api.sendMessage(`📝 **TEXT COUNTS**:\n• Total Words: \`${words}\`\n• Characters (spaces included): \`${text.length}\``, event.threadID);
    }
  },
  {
    config: {
      name: "passwordgen",
      aliases: ["pwdgen", "password"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} or {pn} [length]",
      description: "Generates a mathematically secure, uncrackable random password."
    },
    onStart: async ({ api, event, args }) => {
      const len = parseInt(args[0]) || 12;
      const pwd = crypto.randomBytes(len).toString('hex').slice(0, len);
      await api.sendMessage(`🔐 **GENERATED PASSWORD**:\n\`${pwd}\`\n\n⚠️ *Keep this password extremely secure and private!*`, event.threadID);
    }
  },
  {
    config: {
      name: "weather",
      aliases: ["forecast"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn} [city_name]",
      description: "Retrieve meteorological parameters and climate forecasts."
    },
    onStart: async ({ api, event, args }) => {
      const city = args.join(" ") || "Singapore";
      const temp = (Math.random() * 8 + 25).toFixed(1);
      const hum = Math.floor(Math.random() * 20 + 60);
      await api.sendMessage(`🌤️ **METEOROLOGICAL STATIONS**: **${city.toUpperCase()}**\n` +
        `• Temperature: \`${temp} °C\`\n` +
        `• Humidity: \`${hum}%\`\n` +
        `• Winds: \`14.2 km/h SSE\`\n` +
        `• Outlook: Partial Cloud cover, mild breeze`, event.threadID);
    }
  },
  {
    config: {
      name: "datetime",
      aliases: ["time"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Displays current timestamp, UTC settings, and active calendar date."
    },
    onStart: async ({ api, event }) => {
      const d = new Date();
      await api.sendMessage(`⏰ **DATETIME CLOCK**\n` +
        `• System Time: \`${d.toLocaleTimeString()}\`\n` +
        `• Calendar Date: \`${d.toLocaleDateString()}\`\n` +
        `• ISO: \`${d.toISOString()}\``, event.threadID);
    }
  },
  {
    config: {
      name: "calculator",
      aliases: ["calc"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [expression]",
      description: "Quick inline calculator helper."
    },
    onStart: async ({ api, event, args }) => {
      const problem = args.join(" ");
      if (!problem) return api.sendMessage("⚠️ Type standard math expression (e.g. 50 * 5).", event.threadID);
      try {
        const val = eval(problem.replace(/[^0-9+\-*/(). ]/g, ''));
        await api.sendMessage(`🔢 Result: **${val}**`, event.threadID);
      } catch (err) {
        await api.sendMessage("❌ Invalid expression.", event.threadID);
      }
    }
  },
  {
    config: {
      name: "randomuser",
      aliases: ["randuser"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Generate mock data profiles for software development purposes."
    },
    onStart: async ({ api, event }) => {
      const names = ["Alex Mercer", "Jordan Belfort", "Sarah Connor", "Luke Skywalker", "Ada Lovelace"];
      const chosen = names[Math.floor(Math.random() * names.length)];
      const num = Math.floor(Math.random() * 9000000) + 1000000;
      await api.sendMessage(`👤 **MOCK IDENTIFICATION PROFILES**:\n` +
        `• Full Name: \`${chosen}\`\n` +
        `• Phone Number: \`+1-555-${num}\`\n` +
        `• Email: \`${chosen.toLowerCase().replace(" ", "")}@mockmail.com\`\n` +
        `• Country: United States`, event.threadID);
    }
  },
  {
    config: {
      name: "say",
      aliases: ["speak"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [some_text]",
      description: "Echo parameters with custom casing."
    },
    onStart: async ({ api, event, args }) => {
      const txt = args.join(" ");
      if (!txt) return api.sendMessage("⚠️ What should I say?", event.threadID);
      await api.sendMessage(`📢 **Speaking**: ${txt}`, event.threadID);
    }
  },
  {
    config: {
      name: "choose",
      aliases: ["select"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [opt_1] | [opt_2]",
      description: "Forces bot to choose between two choices split by a pipeline symbol."
    },
    onStart: async ({ api, event, args }) => {
      const split = args.join(" ").split("|");
      if (split.length < 2) return api.sendMessage("⚠️ Split options using a pipe '|'. Example: `/choose Coffee | Tea`", event.threadID);
      const chosen = split[Math.floor(Math.random() * split.length)].trim();
      await api.sendMessage(`🤔 I pick: **${chosen}**`, event.threadID);
    }
  },
  {
    config: {
      name: "echo",
      aliases: ["repeat"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "fun",
      guide: "{pn} [text]",
      description: "Repeats exactly what you type back."
    },
    onStart: async ({ api, event, args }) => {
      const msg = args.join(" ");
      if (!msg) return api.sendMessage("⚠️ Type something for me to echo.", event.threadID);
      await api.sendMessage(msg, event.threadID);
    }
  },
  {
    config: {
      name: "truthordare",
      aliases: ["tod"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "fun",
      guide: "{pn}",
      description: "Rounds up players to trigger Truth or Dare parameters."
    },
    onStart: async ({ api, event }) => {
      const choice = Math.random() < 0.5 ? "TRUTH" : "DARE";
      await api.sendMessage(`🎲 **TRUTH OR DARE WHEEL**\n\nThe pendulum of fate swings... **${choice}**! Type \`/truth\` or \`/dare\` to accept!`, event.threadID);
    }
  }
];

module.exports = funCommands;
