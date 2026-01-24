import { pathsToModuleNameMapper } from 'ts-jest';
import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  globalSetup: './test/globalSetup.ts',
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['<rootDir>/test/setupFilesAfterEnv.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePaths: ['./'],
  moduleNameMapper:
    pathsToModuleNameMapper({
      '@/*': ['src/*'],
      '@/types/*': ['src/types/*'],
      '@/core/*': ['src/core/*'],
      '@/config/*': ['src/config/*'],
      '@/tools/*': ['src/tools/*'],
      '@/utils/*': ['src/utils/*'],
    }) ?? {},

  // Modern ts-jest configuration
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },

  roots: ['<rootDir>'],
  moduleFileExtensions: ['js', 'ts'],
  moduleDirectories: ['node_modules', '<rootDir>'],

  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
  // Coverage settings - use --coverage flag to enable
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover', 'json'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/',
    '/coverage/',
    '/test/',
  ],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },

  // Test patterns and timeouts
  testMatch: ['**/*.test.ts'],
  testTimeout: 10000,

  // Reporting and output
  verbose: true,
  reporters: [
    'default',
    'summary',
    [
      'jest-junit',
      { outputDirectory: 'coverage', outputName: 'jest-junit.xml' },
    ],
  ],

  // Error handling
  bail: 1,

  // Performance
  maxWorkers: '50%',

  // Clear mocks and restore after each test
  clearMocks: true,
  restoreMocks: true,
};

export default config;
