const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh").default;

module.exports = [
  {
    ignores: ["node_modules/**", "client/node_modules/**", "client/dist/**"],
  },
  // server.js + characters/*.js + tests/*.js — Node CommonJS
  {
    files: ["server.js", "characters/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { args: "none", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  // client/src/**  — browser + JSX + React
  {
    files: ["client/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "18.3" } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules, // automatic JSX runtime — no React import required
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off", // no PropTypes anywhere in this codebase, not adopting now
      "react/no-unescaped-entities": "warn", // stylistic, would flag existing Thai/English copy text
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "react-refresh/only-export-components": "warn",
      // ยังไม่ใช้ React Compiler — rule ชุดนี้ (v7 "recommended") เข้มเกินไปสำหรับ baseline lint รอบนี้
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
