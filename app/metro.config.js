const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.alias = {
  ...config.resolver.alias,
  "@": path.resolve(projectRoot),
};

module.exports = config;
