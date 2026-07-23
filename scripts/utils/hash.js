const crypto = require("crypto");
function hashContent(content, algorithm = "sha256") {
  return crypto.createHash(algorithm).update(String(content || ""), "utf8").digest("hex");
}
module.exports = { hashContent };