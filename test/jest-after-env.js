// Runs with the test framework installed (unlike `jest-setup.js`, which runs
// before it): the shared workspace snapshot is emptied before every test, so
// one test's answers never serve another's screens (BUILD-PLAN 24.9.1).
const { resetSnapshot } = require('@/lib/platform/snapshot');

beforeEach(() => {
  resetSnapshot();
});
