module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: [
    '**/test/domain/**/*.test.ts',
    '**/test/application/**/*.test.ts',
    '**/test/infrastructure/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
