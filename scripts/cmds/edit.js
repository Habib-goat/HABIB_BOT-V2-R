/*
 Final edit.js progress patch for Riyad Bot
 NOTE:
 - Uses api.editMessage(messageID, text, callback) signature.
 - If your fca-eryxenx build uses a different signature, adjust the editProgress() method.
*/

function editProgress(api, messageID, text) {
  return new Promise((resolve) => {
    if (!api.editMessage) return resolve(false);

    try {
      api.editMessage(messageID, text, () => resolve(true));
    } catch {
      try {
        api.editMessage(text, messageID, () => resolve(true));
      } catch {
        resolve(false);
      }
    }
  });
}

/*
Replace your progress update calls with:

await editProgress(api, waitMsg.messageID,
`🖌️ Editing Image...

▓▓░░░░░░░░ 20%
📥 Uploading image...`);

Then continue:
30%,40%,50%,60%,70%,80%,90%,100%.

This helper tries both common FCA editMessage signatures.
*/

module.exports = { editProgress };
