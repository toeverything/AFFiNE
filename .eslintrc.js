// https://eslint.org/docs/latest/user-guide/configuring
// "off" or 0 - turn the rule off
// "warn" or 1 - turn the rule on as a warning (doesn’t affect exit code)
// "error" or 2 - turn the rule on as an error (exit code will be 1)

/** @type { import('eslint').Linter.Config } */
module.exports = {
  extends: ['plugin:prettier/recommended'],
  rules: {
    'prettier/prettier': 'warn',
  },

  reportUnusedDisableDirectives: true,
};
