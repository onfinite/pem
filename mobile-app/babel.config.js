module.exports = function (api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
          },
        },
      ],
      /** Reanimated’s plugin includes worklet transforms — do not add `react-native-worklets/plugin` (Babel duplicate). */
      "react-native-reanimated/plugin",
    ],
  };
};
