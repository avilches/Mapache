/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-expo|expo|expo-asset|expo-file-system|expo-modules-core|@expo|@react-native|react-native|fflate)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.ts',
    '^expo-file-system/legacy$':
      '<rootDir>/__mocks__/expo-file-system/legacy.ts',
    '^expo-asset$': '<rootDir>/__mocks__/expo-asset.ts',
    '^fflate$': '<rootDir>/__mocks__/fflate.ts',
    // Silence asset requires (zip files, images, etc.)
    '\\.(zip|png|jpg|jpeg|gif|svg|mp3)$': '<rootDir>/__mocks__/fileMock.ts',
  },
  globals: {},
};
