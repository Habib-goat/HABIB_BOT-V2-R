/**
 * Parse command metadata from a command file.
 */

function parseCommandMetadata(code) {
  if (typeof code !== "string") return null;

  const match = (prop) => {
    const regex = new RegExp(
      prop + "\\s*:\\s*['\"`]([^'\"`]*)['\"`]",
      "i"
    );

    const result = code.match(regex);
    return result ? result[1] : null;
  };

  const name = match("name");
  if (!name) return null;

  return {
    name: name.toLowerCase(),
    version: match("version") || "1.0.0",
    author: match("author") || match("credits") || "Unknown",
    category: match("category") || "Uncategorized",
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
