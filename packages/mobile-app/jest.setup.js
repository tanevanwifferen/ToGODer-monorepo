jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-quick-crypto for tests
jest.mock('react-native-quick-crypto', () => ({
  randomBytes: (size) => Buffer.alloc(size),
  createCipheriv: () => ({
    update: () => Buffer.from(''),
    final: () => Buffer.from(''),
    getAuthTag: () => Buffer.alloc(16),
  }),
  createDecipheriv: () => ({
    update: () => Buffer.from(''),
    final: () => Buffer.from(''),
    setAuthTag: () => {},
  }),
  pbkdf2Sync: () => Buffer.alloc(32),
}));

// Mock @craftzdog/react-native-buffer for tests
jest.mock('@craftzdog/react-native-buffer', () => ({
  Buffer: global.Buffer || require('buffer').Buffer,
}));
