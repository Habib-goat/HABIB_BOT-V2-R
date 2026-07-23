function parseCommandMetadata(code) {
  if (typeof code !== "string") return null;
  const match = (prop) => code.match(new RegExp(`${prop}\\s*:\\s*["'`](.*?)["'`]`, "i"))?.[1];
  const name = match("name");
  if (!name) return null;
  return {
    name: name.toLowerCase(),
    version: match("version") || "1.0.0",
    author: match("author") || match("credits") || "Unknown",
    category: match("category") || "Uncategorized",
    shortDescription: match("shortDescription") || match("description") || "No description",
    guide: match("guide") || "{pn}"
  };
}
module.exports = { parseCommandMetadata };