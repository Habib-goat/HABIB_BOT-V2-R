class ProgressUI {
  static buildBar(pct) {
    const filled = Math.min(10, Math.max(0, Math.floor(pct / 10)));
    return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${pct}%`;
  }

  static renderInstallProgress(commandName, stepName, pct, frameIdx = 0) {
    const frames = ["◖", "◕", "◔", "◓", "◒", "◑", "◐"];
    const icon = frames[frameIdx % frames.length];
    return (
      `📦 [ RIYAD STORE ] Installing ${commandName}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${icon} ${stepName}...\n` +
      `${this.buildBar(pct)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  static renderSuccessCard({ name, version, author, category, id, filePath, autoloadStatus }) {
    return (
      `✅ [ RIYAD STORE - INSTALLED ]\n` +
      `╭─────────────◊\n` +
      `├‣ Name     : ${name}\n` +
      `├‣ ID       : ${id || "N/A"}\n` +
      `├‣ Version  : v${version || "1.0.0"}\n` +
      `├‣ Author   : ${author || "Unknown"}\n` +
      `├‣ Category : ${category || "General"}\n` +
      `├‣ Location : ${filePath}\n` +
      `╰─────────────◊\n` +
      `🚀 ${autoloadStatus || "Command auto-loaded successfully!"}`
    );
  }

  static renderFileExistsCard(name, filePath) {
    return (
      `❌ [ FILE ALREADY EXISTS ]\n` +
      `╭─────────────◊\n` +
      `├‣ Command  : ${name}\n` +
      `├‣ Location : ${filePath}\n` +
      `╰─────────────◊\n` +
      `💡 Suggestion: Use "/rs update ${name}" to update or replace this command safely.`
    );
  }

  static renderCommandInfo(info) {
    return (
      `📦 [ RIYAD STORE - COMMAND INFO ]\n` +
      `╭─────────────◊\n` +
      `├‣ Name        : ${info.name}\n` +
      `├‣ ID          : ${info.id || "N/A"}\n` +
      `├‣ Author      : ${info.author || "Unknown"}\n` +
      `├‣ Version     : v${info.version || "1.0.0"}\n` +
      `├‣ Category    : ${info.category || "General"}\n` +
      `├‣ Views       : 👁️ ${info.views || 0}\n` +
      `├‣ Likes       : ❤️ ${info.likes || 0}\n` +
      `├‣ Downloads   : ⬇️ ${info.downloads || info.installs || 0}\n` +
      `╰─────────────◊\n` +
      `💡 Use "/rs install ${info.id || info.name}" to install.`
    );
  }

  static renderPaginatedList(items, page, totalPages, totalCount) {
    let msg = `🛍️ [ RIYAD STORE - COMMANDS ]\nPage ${page}/${totalPages} (Total: ${totalCount})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    (items || []).forEach((cmd, idx) => {
      msg += `╭─‣ #${cmd.id || idx + 1} | ${cmd.name.toUpperCase()}\n├‣ Author   : ${cmd.author || "Unknown"}\n├‣ Category : ${cmd.category || "General"}\n╰─────────────◊\n\n`;
    });
    return msg.trim();
  }
}

module.exports = ProgressUI;
