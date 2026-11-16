/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // `src/` holds unit specs next to the code; `test/` holds tests that start real
  // servers (the GraphQL app over HTTP, a gRPC server on a random port).
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
