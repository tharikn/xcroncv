/** Unit tests cover pure logic (auth/token, mappers, validation, layout maths). UI behaviour is covered by Playwright (see e2e/). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', diagnostics: false }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
