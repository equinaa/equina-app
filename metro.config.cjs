const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// admin/ is a separate Next.js app with its own node_modules and build
// output. Nothing in the mobile app imports it, so Metro never needs to see it.
const adminDirectory = path.join(__dirname, "admin");
const escaped = adminDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escaped}(\\/|\\\\).*`)
];

module.exports = config;
