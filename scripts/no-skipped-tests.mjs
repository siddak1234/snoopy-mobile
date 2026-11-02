/**
 * Fails when the suite skipped a test (M4: no silent skips).
 *
 * `npm run test:coverage` writes jest's JSON report to
 * coverage/jest-results.json. A green run used to read "1 skipped" and pass;
 * now any pending test (`it.skip`, `xit`, `describe.skip`, or a sibling
 * shadowed by an `it.only`) or todo test (`it.todo`) is red, in verify and in
 * CI's Test job alike.
 *
 *   node scripts/no-skipped-tests.mjs [coverage/jest-results.json]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The reasons a report fails, empty when it passes. */
export function skippedTestProblems(report) {
  const problems = [];
  if (!report || typeof report.numTotalTests !== 'number') {
    return ['not a jest --json report'];
  }
  if (report.numTotalTests === 0) problems.push('the suite ran no tests');
  if (report.numPendingTests > 0) problems.push(`${report.numPendingTests} skipped`);
  if (report.numTodoTests > 0) problems.push(`${report.numTodoTests} todo`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? 'coverage/jest-results.json';
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`FAIL: no jest report at ${path} (run npm run test:coverage first): ${error.message}`);
    process.exit(1);
  }
  const problems = skippedTestProblems(report);
  if (problems.length > 0) {
    console.error(`FAIL: skipped tests: ${problems.join(', ')} of ${report.numTotalTests}`);
    process.exit(1);
  }
  console.log(`no skipped tests: ${report.numPassedTests} of ${report.numTotalTests} ran and passed`);
}
