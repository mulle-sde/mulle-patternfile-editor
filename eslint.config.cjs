/** eslint.config.cjs */
const alignAssignments = require('eslint-plugin-align-assignments');
//const alignAssignments = require('@0x706b/eslint-plugin-align-assignments');

module.exports = [
   {
      files: ["**/*.js"],

      languageOptions: {
         ecmaVersion: "latest",
         sourceType: "module",
      },

      rules: {
         // === YOUR ORIGINAL RULES (kept exactly) ===
         indent: ["error", 3, { SwitchCase: 1 }],
         "brace-style": ["error", "allman", { allowSingleLine: false }],
         semi: ["error", "always"],
         quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
         "no-redeclare": ["error"],
         "no-shadow": ["error"],
         "prefer-const": ["error", { destructuring: "all", ignoreReadBeforeAssign: true }],
         "no-unused-vars": ["warn", { vars: "all", args: "after-used", ignoreRestSiblings: true }],
         "space-in-parens": ["error", "never"],
         "space-before-blocks": ["error", "always"],
         curly: ["error", "all"],
         "keyword-spacing": ["error", { before: true, after: true }],

         // === NEW: FORCE ONE VAR/PROP PER LINE ===
         'one-var': ['error', 'never'], // no const a=1,b=2
         'object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],

         // === CLEANUP: align colons in objects (optional but pretty) ===
         'key-spacing': ['error', { align: 'colon' }],

         // === ENSURE MULTILINE OBJECTS ===
         'object-curly-newline': ['error', { multiline: true, consistent: true }],
      }
   }
];
