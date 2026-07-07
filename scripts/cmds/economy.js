const database = require('../utils/database');

module.exports = {
  config: {
    name: "economy",
    aliases: ["bank", "daily", "work", "balance", "level", "inventory", "leaderboard", "coins", "wallet"],
    version: "1.0.0",
    author: "Riyad Bot",
    countDown: 3,
    role: 0,
    category: "economy",
    guide: {
      en: "{pn} [daily | work | balance | bank deposit/withdraw [amount] | inventory | leaderboard]"
    },
    description: {
      en: "Complete game economy: Daily reward, Work, Bank actions, Levels, Inventory, and Leaderboard."
    }
  },

  onStart: async function({ api, event, args, message }) {
    const senderID = event.senderID;
    const threadID = event.threadID;
    const subCommand = args[0] ? args[0].toLowerCase() : "balance";

    // Initialize user in JSON DB
    const user = database.getUser(senderID);

    // Helper for leveled experience
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

    if (subCommand === "daily") {
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000; // 24 hours
      const lastDaily = user.lastDaily || 0;

      if (now - lastDaily < cooldown) {
        const remaining = cooldown - (now - lastDaily);
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        await api.sendMessage(`⏳ [DAILY] You have already claimed your daily coins! Please wait ${hours}h ${minutes}m.`, threadID);
        return;
      }

      const reward = 500;
      const newMoney = (user.money || 0) + reward;
      database.updateUser(senderID, { money: newMoney, lastDaily: now });
      
      const { level, leveledUp } = gainExp(user, 50);

      let msg = `🎁 [DAILY] You claimed your daily reward of 💵 500 coins!\n💰 Wallet Balance: 💵 ${newMoney} coins.\n⭐ Gained 50 EXP.`;
      if (leveledUp) {
        msg += `\n\n🎉 LEVEL UP! You reached Level ${level}! Keep chatting to earn more.`;
      }
      await api.sendMessage(msg, threadID);

    } else if (subCommand === "work") {
      const jobs = [
        { title: "Software Engineer", pay: [150, 300], exp: 20 },
        { title: "AI Trainer", pay: [120, 250], exp: 25 },
        { title: "Graphic Designer", pay: [80, 180], exp: 15 },
        { title: "Discord/Messenger Moderator", pay: [40, 100], exp: 10 },
        { title: "Crypto Miner", pay: [-50, 400], exp: 30 }
      ];

      const job = jobs[Math.floor(Math.random() * jobs.length)];
      const minPay = job.pay[0];
      const maxPay = job.pay[1];
      const earned = Math.floor(Math.random() * (maxPay - minPay + 1)) + minPay;

      const newMoney = (user.money || 0) + earned;
      database.updateUser(senderID, { money: newMoney });
      const { level, leveledUp } = gainExp(user, job.exp);

      let msg = "";
      if (earned >= 0) {
        msg = `💼 [WORK] You worked as a **${job.title}** and earned 💵 ${earned} coins!\n⭐ Gained ${job.exp} EXP. Current wallet: 💵 ${newMoney} coins.`;
      } else {
        msg = `📉 [WORK] You tried mining crypto but your graphics card overheated! You lost 💵 ${Math.abs(earned)} coins repairing it.\n⭐ Gained ${job.exp} EXP. Current wallet: 💵 ${newMoney} coins.`;
      }

      if (leveledUp) {
        msg += `\n\n🎉 LEVEL UP! You reached Level ${level}!`;
      }
      await api.sendMessage(msg, threadID);

    } else if (subCommand === "balance" || subCommand === "wallet" || subCommand === "coins") {
      await api.sendMessage(`💳 [BALANCE] ${user.name}'s Financials:\n👛 Wallet: 💵 ${user.money || 0} coins\n🏦 Bank: 💵 ${user.bank || 0} coins\n⭐ Level: ${user.level || 1} (${user.exp || 0}/${(user.level || 1) * 150} EXP)`, threadID);

    } else if (subCommand === "deposit" || subCommand === "dep") {
      const amountStr = args[1];
      if (!amountStr) {
        await api.sendMessage("⚠️ Specify an amount to deposit. Example: `/economy deposit 200` or `/economy deposit all`", threadID);
        return;
      }

      let amount = 0;
      if (amountStr.toLowerCase() === "all") {
        amount = user.money || 0;
      } else {
        amount = parseInt(amountStr);
      }

      if (isNaN(amount) || amount <= 0) {
        await api.sendMessage("❌ Invalid deposit amount.", threadID);
        return;
      }

      if (amount > (user.money || 0)) {
        await api.sendMessage("❌ You do not have that many coins in your wallet.", threadID);
        return;
      }

      const newWallet = (user.money || 0) - amount;
      const newBank = (user.bank || 0) + amount;
      database.updateUser(senderID, { money: newWallet, bank: newBank });

      await api.sendMessage(`🏦 [BANK] Successfully deposited 💵 ${amount} coins into the bank vault.\n👛 Wallet: 💵 ${newWallet} | 🏦 Bank: 💵 ${newBank}`, threadID);

    } else if (subCommand === "withdraw" || subCommand === "with") {
      const amountStr = args[1];
      if (!amountStr) {
        await api.sendMessage("⚠️ Specify an amount to withdraw. Example: `/economy withdraw 200` or `/economy withdraw all`", threadID);
        return;
      }

      let amount = 0;
      if (amountStr.toLowerCase() === "all") {
        amount = user.bank || 0;
      } else {
        amount = parseInt(amountStr);
      }

      if (isNaN(amount) || amount <= 0) {
        await api.sendMessage("❌ Invalid withdrawal amount.", threadID);
        return;
      }

      if (amount > (user.bank || 0)) {
        await api.sendMessage("❌ You do not have that many coins in your bank vault.", threadID);
        return;
      }

      const newWallet = (user.money || 0) + amount;
      const newBank = (user.bank || 0) - amount;
      database.updateUser(senderID, { money: newWallet, bank: newBank });

      await api.sendMessage(`🏦 [BANK] Successfully withdrew 💵 ${amount} coins from the bank.\n👛 Wallet: 💵 ${newWallet} | 🏦 Bank: 💵 ${newBank}`, threadID);

    } else if (subCommand === "inventory" || subCommand === "inv") {
      const items = user.inventory || [];
      if (items.length === 0) {
        await api.sendMessage(`🎒 [INVENTORY] ${user.name}'s inventory is currently empty. Buy some items using economy commands!`, threadID);
      } else {
        await api.sendMessage(`🎒 [INVENTORY] ${user.name}'s Inventory:\n${items.map((item, index) => `${index + 1}. 📦 ${item}`).join('\n')}`, threadID);
      }

    } else if (subCommand === "leaderboard" || subCommand === "lb") {
      const allUsers = database.getAllUsers();
      const sorted = Object.values(allUsers).sort((a, b) => {
        const totalA = (a.money || 0) + (a.bank || 0);
        const totalB = (b.money || 0) + (b.bank || 0);
        return totalB - totalA;
      }).slice(0, 5);

      let lbText = `🏆 ━━━━ [ ECONOMY LEADERS ] ━━━━ 🏆\n\n`;
      sorted.forEach((u, idx) => {
        const total = (u.money || 0) + (u.bank || 0);
        lbText += `${idx + 1}. 🌟 ${u.name} - 💵 ${total} coins (Level ${u.level || 1})\n`;
      });
      lbText += `\n━━━━━━━━━━━━━━━━━━━━━`;
      await api.sendMessage(lbText, threadID);

    } else {
      await api.sendMessage(`❌ Unknown economy command. Use daily, work, balance, deposit, withdraw, inventory, or leaderboard.`, threadID);
    }
  }
};
