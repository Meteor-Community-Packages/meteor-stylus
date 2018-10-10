module.exports = {
  root: true,
  env: {
    browser: true,
    es6: true,
    meteor: true,
    node: true,
  },
  parser: "babel-eslint",
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    impliedStrict: true,
    allowImportExportEverywhere: true,
  },
  plugins: [
    "meteor",
    "import",
    "unicorn",
    "promise",
    "security",
    "sonarjs",
    "prettier",
  ],
  extends: [
    "plugin:meteor/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:unicorn/recommended",
    "plugin:promise/recommended",
    "plugin:security/recommended",
    "plugin:sonarjs/recommended",
    "prettier",
    "problems",
  ],
  settings: {
    "import/resolver": {
      "babel-module": {
        root: ["./"],
      },
      meteor: {},
    },
  },
  globals: {
    Package: false,
    Npm: false,
    $: false,
  },
  rules: {},
};
