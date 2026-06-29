module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 11,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  env: {
    browser: false,
    node: true,
    jest: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  rules: {
    'no-console': 'off',
    'comma-dangle': ['error', 'always-multiline'],
    '@typescript-eslint/member-delimiter-style': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/adjacent-overload-signatures': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-unused-vars': 'off',
    'require-atomic-updates': 'off',
    'no-useless-catch': 'off',
    'no-unsafe-finally': 'off',
    'no-case-declarations': 'off',
    'no-empty': 'off',
  },
};
