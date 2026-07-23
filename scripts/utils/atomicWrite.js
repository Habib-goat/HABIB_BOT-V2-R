const fs = require("fs");
const path = require("path");

function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

async function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, content, "utf8");
  await fs.promises.rename(tmp, filePath);
}

module.exports = { atomicWriteFileSync, atomicWriteFile };