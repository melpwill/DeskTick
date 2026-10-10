import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import tseslint from "typescript-eslint";

const noRelativeImports = {
  "no-restricted-imports": [
    "error",
    { patterns: [{ group: ["./*", "../*"], message: '相対パスではなく "@/..." を使ってください。' }] },
  ],
};

const modernSyntax = {
  "func-style": ["error", "expression"],
  "prefer-arrow-callback": "error",
  "arrow-body-style": ["error", "as-needed"],
  "object-shorthand": "error",
  "prefer-const": "error",
  "prefer-template": "error",
  "no-var": "error",
  eqeqeq: ["error", "always"],
};

export default tseslint.config(
  { ignores: ["dist/", "release/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      ...modernSyntax,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.mts"],
    plugins: { jsdoc },
    settings: { jsdoc: { mode: "typescript", tagNamePreference: { returns: "return" } } },
    rules: {
      ...noRelativeImports,
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/typedef": [
        "error",
        {
          variableDeclaration: true,
          variableDeclarationIgnoreFunction: true,
          parameter: true,
          propertyDeclaration: true,
          memberVariableDeclaration: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: false,
          require: { FunctionDeclaration: true, MethodDefinition: true, ArrowFunctionExpression: false },
          contexts: ["VariableDeclaration > VariableDeclarator > ArrowFunctionExpression", "TSMethodSignature"],
        },
      ],
      "jsdoc/require-description": ["error", { descriptionStyle: "tag" }],
      "jsdoc/require-param": "error",
      "jsdoc/require-param-type": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns": ["error", { forceRequireReturn: true, forceReturnsWithAsync: true }],
      "jsdoc/require-returns-type": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-tag-names": ["error", { definedTags: ["description"] }],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      ...noRelativeImports,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
