/**
 * ==========================================================
 * Production ESLint Flat Configuration (ESLint v9/v10+)
 * ==========================================================
 * Motive: Ensures enterprise code quality, prevents syntax bugs,
 * enforces uniform coding style, and catches unhandled issues.
 * Placed at project root: eslint.config.js
 * ==========================================================
 */

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "logs/**",
      "uploads/**",
      "coverage/**",
      "prisma/migrations/**",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        node: true,
        process: "readonly",
        console: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "error",
      "no-console": "off",
      "no-constant-condition": "warn",
      "no-duplicate-case": "error",
      "no-extra-semi": "warn",
      "no-unreachable": "error",
      "no-unexpected-multiline": "error",
      "valid-typeof": "error",
      curly: ["error", "multi-line"],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
];
