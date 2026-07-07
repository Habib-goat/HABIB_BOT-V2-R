/**
 * Riyad Bot Framework - MVC User Model representation
 */

class UserModel {
  constructor(rawJson = {}) {
    this.id = rawJson.id || "";
    this.name = rawJson.name || "Default User";
    this.exp = rawJson.exp || 0;
    this.level = rawJson.level || 1;
    this.money = rawJson.money || 500;
    this.bank = rawJson.bank || 0;
    this.lastDaily = rawJson.lastDaily || 0;
    this.banned = !!rawJson.banned;
    this.inventory = rawJson.inventory || [];
  }

  get totalAssets() {
    return this.money + this.bank;
  }

  get expNeededForNextLevel() {
    return this.level * 150;
  }

  get progressPercentage() {
    const needed = this.expNeededForNextLevel;
    return Math.min(100, Math.floor((this.exp / needed) * 100));
  }
}

module.exports = UserModel;
