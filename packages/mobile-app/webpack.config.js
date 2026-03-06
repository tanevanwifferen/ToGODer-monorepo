const path = require('path');

var __dirname = __dirname || path.resolve();

const ttfRule = {
  test: /.ttf$/,
  loader: "url-loader", // or directly file-loader
  include: path.resolve(__dirname, "node_modules/react-native-vector-icons"),
};

module.exports = {
  module: {
    rules: [
      ttfRule,
      // Other rules that you have
    ],
  },
};