const StoreAPI = require("./StoreAPI");
const StoreValidator = require("./StoreValidator");
const { parseCommandMetadata } = require("../utils/parser");
const StoreLogger = require("./StoreLogger");

class StoreUploader {
  static async upload(code, fileName = "") {
    const val = StoreValidator.validate(code);
    if (!val.valid) return { success: false, error: val.error };

    const meta = parseCommandMetadata(code);
    if (!meta || !meta.name) return { success: false, error: "Missing config.name" };

    const payload = {
      rawCode: code,
      name: meta.name,
      version: meta.version,
      author: meta.author,
      category: meta.category,
      guide: meta.guide,
      description: meta.shortDescription,
      longDescription: meta.longDescription,
      fileName: fileName || `${meta.name}.js`
    };

    try {
      const res = await StoreAPI.uploadCommand(payload);
      return { success: true, data: res, metadata: meta };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = StoreUploader;