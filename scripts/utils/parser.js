/**
 * Parse command metadata from a command file.
 *
 * Fix: field extraction is now scoped to the `config` object only (whether
 * written as `config: { ... }` or `module.exports.config = { ... }`).
 * The previous version searched the *entire* file for the first
 * `name: "..."` / `category: "..."` etc. match, which meant an unrelated
 * object literal elsewhere in the file (e.g. FormData's `filename: "input.jpg"`)
 * could be mistaken for the command's own name.
 */

function extractConfigBlock(code) {
  // Find the start of the config object, in either style:
  //   config: { ... }                (inside module.exports = {...})
  //   module.exports.config = { ... } (dot-notation)
  const startMatch = code.match(/(?:module\.exports\.config\s*=|config\s*:)\s*\{/i);
  if (!startMatch) return null;

  const openIdx = startMatch.index + startMatch[0].length - 1; // index of the opening '{'

  // Walk forward tracking brace depth to find the matching closing '}',
  // skipping over braces that appear inside string literals.
  let depth = 0;
  let inString = null; // active quote char, or null

  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    const prev = code[i - 1];

    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return code.slice(openIdx, i + 1);
    }
  }

  return null; // unbalanced braces — bail out rather than guess
}

function parseCommandMetadata(code) {
  if (typeof code !== "string") return null;

  const configBlock = extractConfigBlock(code);
  if (!configBlock) return null;

  const match = (prop) => {
    const regex = new RegExp(
      prop + "\\s*:\\s*['\"`]([^'\"`]*)['\"`]",
      "i"
    );
    const result = configBlock.match(regex);
    return result ? result[1] : null;
  };

  const name = match("name");
  if (!name) return null;

  const roleMatch = configBlock.match(/role\s*:\s*(\d+)/i);

  return {
    name: name.toLowerCase(),
    version: match("version") || "1.0.0",
    author: match("author") || match("credits") || "Unknown",
    category: match("commandCategory") || match("category") || "Uncategorized",
    role: roleMatch ? parseInt(roleMatch[1], 10) : 0,
    shortDescription:
      match("shortDescription") ||
      match("description") ||
      "No description",
    guide: match("guide") || "{pn}"
  };
}

module.exports = {
  parseCommandMetadata
};
