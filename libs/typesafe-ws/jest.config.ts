/* eslint-disable */
export default {
  displayName: 'typesafe-ws',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/js/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/typesafe-ws',
  coverageReporters: ['lcov', 'html'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
