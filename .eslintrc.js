module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: [
    'node_modules/',
    'backend/',
    'mia-dashboard/',
    'dist/',
    '.expo/',
    'coverage/',
    'android/',
    'ios/',
  ],
  rules: {
    'react-hooks/refs': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/immutability': 'warn',
  },
  overrides: [
    {
      files: ['__tests__/**', '__mocks__/**', 'jest.setup.*'],
      env: { jest: true },
    },
  ],
};
