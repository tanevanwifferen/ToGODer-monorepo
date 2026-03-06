const { getDefaultConfig } = require("expo/metro-config");

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.resolver = {
  ...defaultConfig.resolver,
  sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs'],
  unstable_enablePackageExports: true,
};

defaultConfig.resolver.assetExts.push('ttf');

module.exports = defaultConfig;