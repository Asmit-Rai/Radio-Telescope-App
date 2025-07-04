const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { getDefaultConfig: getExpoDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const expoConfig = getExpoDefaultConfig(__dirname);

const config = mergeConfig(defaultConfig, expoConfig);

module.exports = config;