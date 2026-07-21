const axios = require("axios");
const fs = require("fs");

module.exports.downloadFile = async function (url, filePath) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream"
  });

  const writer = fs.createWriteStream(filePath);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};
