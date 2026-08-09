module.exports = {
  config: {
    name: "adduser",
    version: "1.6.0",
    author: "Riyad Bot",
    countDown: 5,
    role: 1,
    description: "Add a member to the chat group using a Facebook link or UID.",
    category: "box chat",
    guide: "{pn} [Facebook link | User ID]"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    if (!args || args.length === 0) {
      return api.sendMessage(
        "⚠️ Please enter a Facebook profile link or User ID.",
        threadID,
        messageID
      );
    }

    const users = [];
    const failed = [];
    for (const raw of args) {
      const item = String(raw).trim();
      const idFromUrl = item.match(/[?&]id=(\d+)/i) || item.match(/profile\.php\?id=(\d+)/i);
      const userID = idFromUrl ? idFromUrl[1] : item.match(/^\d+$/)?.[0];
      if (userID) users.push(userID);
      else failed.push(`${item}: invalid UID or profile link`);
    }

    let added = 0;
    for (const userID of users) {
      try {
        // The adapter strips @g.us before calling FCA's MQTT group API.
        // Do not perform a GraphQL membership re-check here: E2EE groups
        // often do not expose a fresh participant list immediately.
        await api.addUserToGroup(userID, threadID);
        added++;
      } catch (err) {
        failed.push(
          `${userID}: ${err?.errorDescription || err?.error || err?.message || String(err)}`
        );
      }
    }

    const lines = [];
    if (added) lines.push(`✅ Successfully added ${added} member${added === 1 ? "" : "s"}.`);
    if (failed.length) lines.push(`❌ Failed:\n${failed.map((x) => `• ${x}`).join("\n")}`);
    return api.sendMessage(lines.join("\n") || "⚠️ No action was taken.", threadID, messageID);
  }
};
