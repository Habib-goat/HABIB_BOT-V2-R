const mongoose = require("mongoose");
const Notice = require("./models/Notice");

const notices = {
  // এখানে তোমার পাঠানো পুরো JSON টা পেস্ট করো
};

async function importNotices() {
  try {
    for (const [name, data] of Object.entries(notices)) {
      await Notice.findOneAndUpdate(
        { name },
        {
          name,
          text: data.text,
          mention: data.mention,
          image: data.image
        },
        {
          upsert: true,
          new: true
        }
      );

      console.log(`Imported: ${name}`);
    }

    console.log("✅ All notices imported successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

importNotices();
