class StoreValidator {
  static validate(code) {
    if (typeof code !== "string" || !code.trim()) {
      return { valid: false, error: "Empty code content provided." };
    }

    try { new Function(code); } catch (err) {
      return { valid: false, error: `JavaScript Syntax Error: ${err.message}` };
    }

    const forbiddenPatterns = [
      { pattern: /global\.GoatBot/i, message: "Forbidden: 'global.GoatBot' is not allowed." },
      { pattern: /Mirai\s*Framework/i, message: "Forbidden: Mirai Framework syntax detected." },
      { pattern: /message\.reply\s*\(/i, message: "Forbidden: Use 'api.reply' or 'api.sendMessage'." }
    ];

    for (const { pattern, message } of forbiddenPatterns) {
      if (pattern.test(code)) return { valid: false, error: message };
    }

    const hasModuleExports = /module\.exports\s*=/i.test(code);
    const hasConfig = /config\s*:\s*\{/i.test(code);
    const hasOnStart = /onStart\s*[:(]/i.test(code);

    if (!hasModuleExports || !hasConfig) return { valid: false, error: "Missing 'module.exports' or 'config'." };
    if (!hasOnStart) return { valid: false, error: "Missing 'onStart' method." };

    return { valid: true };
  }
}

module.exports = StoreValidator;