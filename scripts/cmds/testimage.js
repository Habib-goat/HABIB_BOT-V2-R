module.exports = {
  config: {
    name: "testimage",
    version: "1.0",
    role: 2,
    category: "test"
  },

  onStart: async ({ api, event }) => {
    console.log(api.changeGroupImage.toString());
    return api.sendMessage(
      "Printed changeGroupImage source in console.",
      event.threadID
    );
  }
};
