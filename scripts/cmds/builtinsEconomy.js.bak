/**
 * Riyad Bot Framework - Economy Built-in Commands Bundle
 * Programmatically registers 20 advanced economy, mining, hunting, fishing, and gambling commands.
 */

const database = require('../utils/database');

// Helper to gain leveled experience and update wallet
const gainExp = (userData, expAmount) => {
  let exp = (userData.exp || 0) + expAmount;
  let level = userData.level || 1;
  const neededExp = level * 150;
  let leveledUp = false;

  if (exp >= neededExp) {
    exp -= neededExp;
    level += 1;
    leveledUp = true;
  }
  database.updateUser(userData.id, { exp, level });
  return { level, exp, leveledUp };
};

const economyCommands = [
  {
    config: {
      name: "rank",
      aliases: ["level"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Show your current leveling status, current level, and experience points."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const needed = (user.level || 1) * 150;
      await api.sendMessage(`⭐ **LEVEL CARD**: **${user.name}**\n` +
        `• Level: \`${user.level || 1}\`\n` +
        `• Experience: \`${user.exp || 0} / ${needed} EXP\`\n` +
        `• Net Wealth: \`💵 ${(user.money || 0) + (user.bank || 0)} coins\``, event.threadID);
    }
  },
  {
    config: {
      name: "transfer",
      aliases: ["sendcoins", "pay"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "economy",
      guide: "{pn} [userID] [amount]",
      description: "Send coins from your wallet directly to another user's wallet."
    },
    onStart: async ({ api, event, args }) => {
      const sender = database.getUser(event.senderID);
      const targetId = args[0];
      const amount = parseInt(args[1]);

      if (!targetId || isNaN(amount) || amount <= 0) {
        await api.sendMessage("⚠️ Usage: `/transfer [target_user_id] [amount_of_coins]`", event.threadID);
        return;
      }

      if ((sender.money || 0) < amount) {
        await api.sendMessage("❌ You do not have enough coins in your wallet to complete this transfer.", event.threadID);
        return;
      }

      const target = database.getUser(targetId);
      database.updateUser(event.senderID, { money: (sender.money || 0) - amount });
      database.updateUser(targetId, { money: (target.money || 0) + amount });

      await api.sendMessage(`💸 **TRANSFER SUCCESSFUL**\n` +
        `• From: **${sender.name}**\n` +
        `• To: **${target.name}**\n` +
        `• Amount: \`💵 ${amount} coins\``, event.threadID);
    }
  },
  {
    config: {
      name: "mine",
      aliases: ["dig"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 60, // 1 min cooldown
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Venture deep into the mines to extract raw, valuable minerals."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const ores = [
        { name: "Stone", val: 5, chance: 0.5 },
        { name: "Coal", val: 15, chance: 0.3 },
        { name: "Iron Ore", val: 50, chance: 0.15 },
        { name: "Gold Nuggets", val: 150, chance: 0.04 },
        { name: "Diamonds", val: 500, chance: 0.01 }
      ];

      const roll = Math.random();
      let selected = ores[0];
      let currentChance = 0;

      for (const ore of ores.reverse()) {
        currentChance += ore.chance;
        if (roll <= currentChance) {
          selected = ore;
          break;
        }
      }

      const wallet = (user.money || 0) + selected.val;
      const inv = user.inventory || [];
      inv.push(selected.name);

      database.updateUser(event.senderID, { money: wallet, inventory: inv });
      gainExp(user, 15);

      await api.sendMessage(`⛏️ **MINING ADVENTURE**\n` +
        `You went deep into the crystal caverns and unearthed **${selected.name}**!\n` +
        `• Value: \`💵 ${selected.val} coins\`\n` +
        `• Current Wallet: \`💵 ${wallet} coins\`\n` +
        `• Added item to your bag. ⭐ Gained 15 EXP.`, event.threadID);
    }
  },
  {
    config: {
      name: "fish",
      aliases: ["fishing"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 45,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Throw your rod into the local river and reel in some aquatic wildlife."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const fishes = [
        { name: "Sardine", val: 8 },
        { name: "Catfish", val: 20 },
        { name: "Salmon", val: 45 },
        { name: "Golden Tuna", val: 120 },
        { name: "Great White Shark", val: 600 }
      ];

      const roll = Math.random();
      let fishObj = fishes[0];
      if (roll > 0.98) fishObj = fishes[4];
      else if (roll > 0.90) fishObj = fishes[3];
      else if (roll > 0.70) fishObj = fishes[2];
      else if (roll > 0.40) fishObj = fishes[1];

      const wallet = (user.money || 0) + fishObj.val;
      const inv = user.inventory || [];
      inv.push(fishObj.name);

      database.updateUser(event.senderID, { money: wallet, inventory: inv });
      gainExp(user, 10);

      await api.sendMessage(`🎣 **FISHING REEL**\n` +
        `Splish splash! You successfully caught a **${fishObj.name}**!\n` +
        `• Sold immediately for: \`💵 ${fishObj.val} coins\`\n` +
        `• Added to inventory. ⭐ Gained 10 EXP.`, event.threadID);
    }
  },
  {
    config: {
      name: "hunt",
      aliases: ["hunting"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 50,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Wander deep into the wild woods to track down and hunt animals."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const gameList = [
        { name: "Rabbit", val: 12 },
        { name: "Wild Boar", val: 35 },
        { name: "Deer", val: 75 },
        { name: "Grizzly Bear", val: 200 },
        { name: "Mythical Phoenix", val: 1000 }
      ];

      const roll = Math.random();
      let game = gameList[0];
      if (roll > 0.99) game = gameList[4];
      else if (roll > 0.92) game = gameList[3];
      else if (roll > 0.75) game = gameList[2];
      else if (roll > 0.45) game = gameList[1];

      const wallet = (user.money || 0) + game.val;
      const inv = user.inventory || [];
      inv.push(game.name);

      database.updateUser(event.senderID, { money: wallet, inventory: inv });
      gainExp(user, 18);

      await api.sendMessage(`🏹 **WILD HUNT**\n` +
        `Stealth mode active... You tracked down and bagged a **${game.name}**!\n` +
        `• Bounty Reward: \`💵 ${game.val} coins\`\n` +
        `• Bag status: Added item to your inventory. ⭐ Gained 18 EXP.`, event.threadID);
    }
  },
  {
    config: {
      name: "coinflip",
      aliases: ["cf", "flip"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 5,
      role: 0,
      category: "economy",
      guide: "{pn} [heads | tails] [bet]",
      description: "Flip a high-stakes coin. Double your bet or lose it all!"
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const side = args[0] ? args[0].toLowerCase() : '';
      const bet = parseInt(args[1]);

      if ((side !== 'heads' && side !== 'tails') || isNaN(bet) || bet <= 0) {
        await api.sendMessage("⚠️ Usage: `/coinflip [heads | tails] [bet_amount]`", event.threadID);
        return;
      }

      if ((user.money || 0) < bet) {
        await api.sendMessage("❌ You do not have enough coins in your wallet for this bet.", event.threadID);
        return;
      }

      const flipResult = Math.random() < 0.5 ? 'heads' : 'tails';
      const isWin = side === flipResult;

      let newWallet = user.money || 0;
      if (isWin) {
        newWallet += bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🪙 **COINFLIP: WIN**\n` +
          `The silver coin landed on: **${flipResult.toUpperCase()}**!\n` +
          `• You predicted correctly! You won \`💵 ${bet} coins\`.\n` +
          `• Wallet: \`💵 ${newWallet} coins\``, event.threadID);
      } else {
        newWallet -= bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🪙 **COINFLIP: LOSE**\n` +
          `The silver coin landed on: **${flipResult.toUpperCase()}**!\n` +
          `• Oh no! You got it wrong. You lost \`💵 ${bet} coins\`.\n` +
          `• Wallet: \`💵 ${newWallet} coins\``, event.threadID);
      }
    }
  },
  {
    config: {
      name: "slot",
      aliases: ["slots", "spin"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 8,
      role: 0,
      category: "economy",
      guide: "{pn} [bet]",
      description: "Spin the classic three-reel slot machine."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const bet = parseInt(args[0]);

      if (isNaN(bet) || bet <= 0) {
        await api.sendMessage("⚠️ Usage: `/slot [bet_amount]`", event.threadID);
        return;
      }

      if ((user.money || 0) < bet) {
        await api.sendMessage("❌ You do not have enough coins.", event.threadID);
        return;
      }

      const items = ["🍎", "🍋", "🍒", "🍇", "💎", "⭐"];
      const r1 = items[Math.floor(Math.random() * items.length)];
      const r2 = items[Math.floor(Math.random() * items.length)];
      const r3 = items[Math.floor(Math.random() * items.length)];

      let multiplier = 0;
      if (r1 === r2 && r2 === r3) {
        multiplier = r1 === "💎" ? 5 : 3;
      } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        multiplier = 1.5;
      }

      let newWallet = user.money || 0;
      if (multiplier > 0) {
        const won = Math.floor(bet * multiplier);
        newWallet += won;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🎰 **SLOT MACHINE**\n` +
          `[ ${r1} | ${r2} | ${r3} ]\n\n` +
          `🎉 **JACKPOT!** You won \`💵 ${won} coins\`!\n` +
          `• Balance: \`💵 ${newWallet} coins\``, event.threadID);
      } else {
        newWallet -= bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🎰 **SLOT MACHINE**\n` +
          `[ ${r1} | ${r2} | ${r3} ]\n\n` +
          `💸 Aw, no matches. You lost \`💵 ${bet} coins\`.\n` +
          `• Balance: \`💵 ${newWallet} coins\``, event.threadID);
      }
    }
  },
  {
    config: {
      name: "rob",
      aliases: ["steal", "mug"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 300, // 5 min cooldown
      role: 0,
      category: "economy",
      guide: "{pn} [userID]",
      description: "Attempt to stealthily mug another active user for quick pocket money."
    },
    onStart: async ({ api, event, args }) => {
      const sender = database.getUser(event.senderID);
      const targetId = args[0];

      if (!targetId || targetId === event.senderID) {
        await api.sendMessage("⚠️ Who do you want to rob? Specify a user ID.", event.threadID);
        return;
      }

      const target = database.getUser(targetId);
      if ((target.money || 0) < 50) {
        await api.sendMessage("❌ That user is too poor to rob. Leave them alone!", event.threadID);
        return;
      }

      const roll = Math.random();
      if (roll < 0.4) {
        // Success
        const stolen = Math.floor(Math.random() * (target.money * 0.25) + 10);
        database.updateUser(event.senderID, { money: (sender.money || 0) + stolen });
        database.updateUser(targetId, { money: (target.money || 0) - stolen });
        await api.sendMessage(`🥷 **HEIST SUCCESSFUL**\n` +
          `You sneaked up behind **${target.name}** and mugged them!\n` +
          `• Stole: \`💵 ${stolen} coins\`\n` +
          `• Your wallet: \`💵 ${(sender.money || 0) + stolen} coins\``, event.threadID);
      } else {
        // Fail & pay fine
        const fine = 100;
        database.updateUser(event.senderID, { money: Math.max(0, (sender.money || 0) - fine) });
        await api.sendMessage(`👮 **BUSTED!**\n` +
          `The local sheriff caught you trying to pickpocket **${target.name}**!\n` +
          `• Paid Bail/Fine: \`💵 ${fine} coins\``, event.threadID);
      }
    }
  },
  {
    config: {
      name: "richest",
      aliases: ["topwealth", "richlb"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 3,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Display the wealthiest 5 users globally."
    },
    onStart: async ({ api, event }) => {
      const all = database.getAllUsers();
      const sorted = Object.values(all).sort((a, b) => {
        return ((b.money || 0) + (b.bank || 0)) - ((a.money || 0) + (a.bank || 0));
      }).slice(0, 5);

      let txt = `👑 **RICHEST PLAYERS LEADERBOARD** 👑\n\n`;
      sorted.forEach((u, i) => {
        txt += `${i + 1}. 💎 **${u.name}** — \`💵 ${(u.money || 0) + (u.bank || 0)} coins\` (lvl ${u.level || 1})\n`;
      });
      await api.sendMessage(txt, event.threadID);
    }
  },
  {
    config: {
      name: "shop",
      aliases: ["market"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "List the physical items available to purchase from the system shop."
    },
    onStart: async ({ api, event }) => {
      await api.sendMessage(`🏪 **RIYAD TOWN GENERAL STORE**\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `1. 🛠️ **Iron Pickaxe** — Price: \`💵 500\`\n` +
        `   • Desc: Doubles mining luck\n` +
        `2. 🎣 **Golden Rod** — Price: \`💵 300\`\n` +
        `   • Desc: Multiplies fishing yield\n` +
        `3. 🔫 **Hunting Rifle** — Price: \`💵 800\`\n` +
        `   • Desc: Multiplies hunting targets\n` +
        `4. 🎟️ **Lottery Ticket** — Price: \`💵 50\`\n` +
        `   • Desc: Win up to 5,000 coins\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 To purchase: \`/buy [item_number_or_name]\``, event.threadID);
    }
  },
  {
    config: {
      name: "buy",
      aliases: ["purchase"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "economy",
      guide: "{pn} [item_name_or_number]",
      description: "Buy an item listed from the general store."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const target = args.join(" ").toLowerCase();

      let item = null;
      let cost = 0;

      if (target.includes("pickaxe") || target === "1") {
        item = "Iron Pickaxe";
        cost = 500;
      } else if (target.includes("rod") || target === "2") {
        item = "Golden Rod";
        cost = 300;
      } else if (target.includes("rifle") || target === "3") {
        item = "Hunting Rifle";
        cost = 800;
      } else if (target.includes("ticket") || target === "4") {
        item = "Lottery Ticket";
        cost = 50;
      }

      if (!item) {
        await api.sendMessage("❌ Item not found in the shop! Type `/shop` to view available stock.", event.threadID);
        return;
      }

      if ((user.money || 0) < cost) {
        await api.sendMessage(`❌ Insufficient funds. You need \`💵 ${cost} coins\` in your wallet.`, event.threadID);
        return;
      }

      const inv = user.inventory || [];
      inv.push(item);
      database.updateUser(event.senderID, {
        money: (user.money || 0) - cost,
        inventory: inv
      });

      await api.sendMessage(`🛍️ **STORE PURCHASE**\n` +
        `You bought a **${item}** for \`💵 ${cost} coins\`!\n` +
        `• Remaining wallet balance: \`💵 ${(user.money || 0) - cost} coins\``, event.threadID);
    }
  },
  {
    config: {
      name: "sell",
      aliases: ["pawn"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 2,
      role: 0,
      category: "economy",
      guide: "{pn} [item_name]",
      description: "Pawn/sell an item from your bag to obtain quick coins."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const query = args.join(" ").toLowerCase();

      if (!query) {
        await api.sendMessage("⚠️ State the item you want to sell from your `/economy inventory`.", event.threadID);
        return;
      }

      const inv = user.inventory || [];
      const itemIdx = inv.findIndex(item => item.toLowerCase().includes(query));

      if (itemIdx === -1) {
        await api.sendMessage(`❌ You don't have any items matching "${query}" in your inventory.`, event.threadID);
        return;
      }

      const itemName = inv[itemIdx];
      let value = 20; // default junk value

      if (itemName === "Iron Pickaxe") value = 250;
      else if (itemName === "Golden Rod") value = 150;
      else if (itemName === "Hunting Rifle") value = 400;
      else if (itemName === "Diamonds") value = 500;
      else if (itemName === "Gold Nuggets") value = 150;
      else if (itemName === "Salmon") value = 45;

      inv.splice(itemIdx, 1);
      const money = (user.money || 0) + value;
      database.updateUser(event.senderID, { money, inventory: inv });

      await api.sendMessage(`💰 **SOLD ITEM**\n` +
        `You successfully pawned your **${itemName}** for \`💵 ${value} coins\`!\n` +
        `• Current Wallet: \`💵 ${money} coins\``, event.threadID);
    }
  },
  {
    config: {
      name: "sellall",
      aliases: ["pawnall"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 5,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Liquidate your entire inventory instantly for high payout."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const inv = user.inventory || [];

      if (inv.length === 0) {
        await api.sendMessage("🎒 Your inventory is empty. Get working, mining, or hunting!", event.threadID);
        return;
      }

      let totalVal = 0;
      inv.forEach(itemName => {
        let value = 25;
        if (itemName === "Iron Pickaxe") value = 250;
        else if (itemName === "Golden Rod") value = 150;
        else if (itemName === "Hunting Rifle") value = 400;
        else if (itemName === "Diamonds") value = 500;
        else if (itemName === "Gold Nuggets") value = 150;
        else if (itemName === "Salmon") value = 45;
        totalVal += value;
      });

      database.updateUser(event.senderID, { money: (user.money || 0) + totalVal, inventory: [] });
      await api.sendMessage(`💰 **LIQUIDATION RESULTS**\n` +
        `Sold all \`${inv.length}\` items in your inventory for a whopping payout of \`💵 ${totalVal} coins\`!`, event.threadID);
    }
  },
  {
    config: {
      name: "hourly",
      aliases: ["hourlycoins"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 5,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Claim a smaller recurring reward every single hour."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const reward = 100;
      database.updateUser(event.senderID, { money: (user.money || 0) + reward });
      await api.sendMessage(`🎁 **HOURLY CLAIM**\n` +
        `You claimed your hourly stipend of \`💵 ${reward} coins\`!\n` +
        `• Wallet: \`💵 ${(user.money || 0) + reward} coins\``, event.threadID);
    }
  },
  {
    config: {
      name: "salary",
      aliases: ["paycheck"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 120,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Claim your level-adjusted salary paycheck."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const lvl = user.level || 1;
      const salary = lvl * 150;
      database.updateUser(event.senderID, { money: (user.money || 0) + salary });
      await api.sendMessage(`💼 **LEVEL-BASED PAYCHECK**\n` +
        `As a level **${lvl}** operator, your paycheck yields: \`💵 ${salary} coins\`!`, event.threadID);
    }
  },
  {
    config: {
      name: "roulette",
      aliases: ["spinwheel"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 8,
      role: 0,
      category: "economy",
      guide: "{pn} [red | black | green] [bet]",
      description: "Bet on roulette colors (green has the highest x14 multiplier!)."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const color = args[0] ? args[0].toLowerCase() : '';
      const bet = parseInt(args[1]);

      if ((color !== 'red' && color !== 'black' && color !== 'green') || isNaN(bet) || bet <= 0) {
        await api.sendMessage("⚠️ Usage: `/roulette [red | black | green] [bet]`", event.threadID);
        return;
      }

      if ((user.money || 0) < bet) {
        await api.sendMessage("❌ Too poor for this bet.", event.threadID);
        return;
      }

      const roll = Math.floor(Math.random() * 37); // 0-36
      let landed = '';
      if (roll === 0) landed = 'green';
      else if (roll % 2 === 0) landed = 'black';
      else landed = 'red';

      let newWallet = user.money || 0;
      if (landed === color) {
        const winMult = color === 'green' ? 14 : 2;
        const prize = bet * winMult;
        newWallet += prize;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🔴⚫ **ROULETTE WHEEL SPINS**\n` +
          `The ball landed on: **${landed.toUpperCase()}** (${roll})!\n` +
          `• **WINNER!** You won \`💵 ${prize} coins\`!\n` +
          `• Balance: \`💵 ${newWallet} coins\``, event.threadID);
      } else {
        newWallet -= bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🔴⚫ **ROULETTE WHEEL SPINS**\n` +
          `The ball landed on: **${landed.toUpperCase()}** (${roll})!\n` +
          `• **LOST!** You lost \`💵 ${bet} coins\`.\n` +
          `• Balance: \`💵 ${newWallet} coins\``, event.threadID);
      }
    }
  },
  {
    config: {
      name: "blackjack",
      aliases: ["bj"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 10,
      role: 0,
      category: "economy",
      guide: "{pn} [bet]",
      description: "Play standard high-stakes Blackjack against the dealer."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const bet = parseInt(args[0]);

      if (isNaN(bet) || bet <= 0) {
        return api.sendMessage("⚠️ Usage: `/blackjack [bet]`", event.threadID);
      }

      if ((user.money || 0) < bet) {
        return api.sendMessage("❌ Insufficient wallet coins.", event.threadID);
      }

      // Quick blackjack outcome algorithm
      const playerVal = Math.floor(Math.random() * 8) + 15; // 15-22
      const dealerVal = Math.floor(Math.random() * 8) + 14; // 14-21

      let msg = `♠️♥️ **BLACKJACK ARENA** 🃏\n\n`;
      msg += `• Your hand total: \`${playerVal}\`\n`;
      msg += `• Dealer's hand total: \`${dealerVal}\`\n\n`;

      let newWallet = user.money || 0;
      if (playerVal > 21) {
        newWallet -= bet;
        msg += `❌ **BUST!** You went over 21. Dealer wins. Lost \`💵 ${bet} coins\`.`;
      } else if (dealerVal > 21 || playerVal > dealerVal) {
        newWallet += bet;
        msg += `🎉 **VICTORY!** You beat the dealer! Won \`💵 ${bet} coins\`.`;
      } else if (playerVal === dealerVal) {
        msg += `🤝 **PUSH!** Hands are equal. Coins returned.`;
      } else {
        newWallet -= bet;
        msg += `❌ **LOST!** Dealer close to 21. Lost \`💵 ${bet} coins\`.`;
      }

      database.updateUser(event.senderID, { money: newWallet });
      await api.sendMessage(msg, event.threadID);
    }
  },
  {
    config: {
      name: "robbery",
      aliases: ["bankheist"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 600,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Conduct a highly dangerous, coordinated vault robbery of the Federal Reserve."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const roll = Math.random();

      if (roll > 0.7) {
        const yieldAmt = Math.floor(Math.random() * 1000) + 1000;
        database.updateUser(event.senderID, { money: (user.money || 0) + yieldAmt });
        await api.sendMessage(`🚨 **BANK VAULT CRACKED**\n` +
          `Excellent coordination! You successfully cracked open the safe and escaped with **💵 ${yieldAmt} coins** before police arrived!`, event.threadID);
      } else {
        const penalty = 300;
        database.updateUser(event.senderID, { money: Math.max(0, (user.money || 0) - penalty) });
        await api.sendMessage("🚨 **HEIST TRIGGERED SIRENS**\n" +
          `SWAT arrived in seconds! You dropped your heavy coin bags escaping. Paid \`💵 ${penalty} coins\` in medical legal fees!`, event.threadID);
      }
    }
  },
  {
    config: {
      name: "claim",
      aliases: ["claimgift"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 10,
      role: 0,
      category: "economy",
      guide: "{pn}",
      description: "Verify and claim periodic dynamic system-issued promo bundles."
    },
    onStart: async ({ api, event }) => {
      const user = database.getUser(event.senderID);
      const gift = 250;
      database.updateUser(event.senderID, { money: (user.money || 0) + gift });
      await api.sendMessage(`🎁 **PROMO SYSTEM**\n` +
        `Your promo was successfully claimed. Credited \`💵 ${gift} coins\` to your wallet.`, event.threadID);
    }
  },
  {
    config: {
      name: "gamble",
      aliases: ["betting"],
      version: "1.0.0",
      author: "Riyad Bot",
      countDown: 5,
      role: 0,
      category: "economy",
      guide: "{pn} [amount]",
      description: "High stakes, raw 50/50 probability. Double your bet or lose it."
    },
    onStart: async ({ api, event, args }) => {
      const user = database.getUser(event.senderID);
      const bet = parseInt(args[0]);

      if (isNaN(bet) || bet <= 0) {
        return api.sendMessage("⚠️ State a valid bet amount.", event.threadID);
      }

      if ((user.money || 0) < bet) {
        return api.sendMessage("❌ Wallet funds insufficient.", event.threadID);
      }

      const win = Math.random() < 0.48; // slightly house edge
      let newWallet = user.money || 0;

      if (win) {
        newWallet += bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🎰 **GAMBLE: WIN**\n` +
          `Luck is on your side! Credited \`💵 ${bet} coins\` to your account.\n` +
          `• Wallet: \`💵 ${newWallet} coins\``, event.threadID);
      } else {
        newWallet -= bet;
        database.updateUser(event.senderID, { money: newWallet });
        await api.sendMessage(`🎰 **GAMBLE: LOSS**\n` +
          `House wins! Lost \`💵 ${bet} coins\`.\n` +
          `• Wallet: \`💵 ${newWallet} coins\``, event.threadID);
      }
    }
  }
];

module.exports = economyCommands;
