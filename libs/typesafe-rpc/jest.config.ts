/* eslint-disable */
export default {
  displayName: 'typesafe-rpc',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/js/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/typesafe-rpc',
  coverageReporters: ['lcov', 'html'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
