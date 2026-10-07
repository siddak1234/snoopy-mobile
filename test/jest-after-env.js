// Runs with the test framework installed (unlike `jest-setup.js`, which runs
// before it): the shared workspace snapshot is emptied before every test, so
// one test's answers never serve another's screens (BUILD-PLAN 24.9.1). So is
// the screen an ended session left for the next sign-in (Gate 24 parity, G4),
// which lives as long as the app's process: each test is a fresh launch.
const { resetSnapshot } = require('@/lib/platform/snapshot');
const { resetReturnForTests } = require('@/lib/view/return-to');

beforeEach(() => {
  resetSnapshot();
  resetReturnForTests();
});
