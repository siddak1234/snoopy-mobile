import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  BLOCK_LIST_RULES,
  BLOCK_SEARCH_CASES,
  BLOCK_SORT_CASES,
  BLOCK_WORDS,
} from '@/lib/generated/platform-contracts/block-rules';
import {
  PAGE_SIZE,
  fill,
  isLong,
  listChoices,
  numberOf,
  pageCount,
  pageRows,
  pageWithin,
  search,
  sortedIndexes,
  tableChoices,
  type SortListRow,
} from '@/lib/view/block-sort';

/**
 * Search, sort and pages (backend ADR-0048 amendment 1, point 4): every case
 * the platform publishes (`snoopy-backend/packages/contracts/fixtures/block-rules/search.json` and `sort.json`,
 * generated into `block-rules.ts`), run against the app's rules — the same
 * cases the backend's reference and the website's `snoopy/lib/block-sort.ts` run.
 * And the words: every one is `BLOCK_WORDS`', none typed where a list is drawn.
 */

describe('the platform\'s search cases', () => {
  it('there are cases, and the page is 25, a query at most 80', () => {
    expect(BLOCK_SEARCH_CASES.length).toBeGreaterThanOrEqual(6);
    expect(BLOCK_LIST_RULES).toEqual({ pageSize: 25, queryLength: 80 });
    expect(PAGE_SIZE).toBe(25);
  });

  it.each(BLOCK_SEARCH_CASES.map((each) => [each.name, each] as const))('%s', (_name, each) => {
    const indexes = each.rows.map((_, at) => at);
    expect(search(indexes, each.query, (at) => each.rows[at]!)).toEqual([...each.matches]);
  });
});

describe('the platform\'s sort cases', () => {
  it.each(BLOCK_SORT_CASES.map((each) => [each.name, each] as const))('%s: its choices, and the order its choice gives', (_name, each) => {
    const choices =
      each.kind === 'list'
        ? listChoices(each.rows as SortListRow[])
        : tableChoices(each.columns ?? [], each.rows as string[][]);
    expect(choices.map((choice) => choice.label)).toEqual([...each.choices]);
    const choice = choices.find((one) => one.label === each.choice)!;
    expect(sortedIndexes(each.rows.length, choice)).toEqual([...each.order]);
  });
});

describe('the rules on their own', () => {
  it('the number rule: money signs, commas, spaces and one trailing %; anything else is no number', () => {
    expect(['$1,204.50', '€ 2,010', '£15', '12%', '-3.5', '0.25'].map(numberOf)).toEqual([1204.5, 2010, 15, 12, -3.5, 0.25]);
    expect(['n/a', '12%%', '1.2.3', '', undefined, null].map(numberOf)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('long is more than 25; pages of 25, held within the pages there are', () => {
    expect([25, 26].map(isLong)).toEqual([false, true]);
    expect([0, 25, 26, 51].map(pageCount)).toEqual([1, 1, 2, 3]);
    const rows = Array.from({ length: 30 }, (_, at) => at);
    expect(pageRows(rows, 2)).toEqual([25, 26, 27, 28, 29]);
    expect(pageWithin(9, 30)).toBe(2);
    expect(pageWithin(0, 30)).toBe(1);
  });

  it('fills a pattern\'s parts: "Page 2 of 5", "Score: high to low", "Nothing matches "jose"."', () => {
    expect(fill(BLOCK_WORDS.pageOf, { n: 2, total: 5 })).toBe('Page 2 of 5');
    expect(fill(BLOCK_WORDS.highToLow, { label: 'Score' })).toBe('Score: high to low');
    expect(fill(BLOCK_WORDS.noMatch, { query: 'jose' })).toBe('Nothing matches "jose".');
  });
});

/** Where search, sort and pages are drawn: no word of theirs is typed there. */
const DRAWN = [
  ...readdirSync(resolve(__dirname, '../components/blocks')).map((name) => join('components/blocks', name)),
  'components/items/flow-items.tsx',
  'app/(tabs)/activity/index.tsx',
];

/** A `BLOCK_WORDS` value written as a string literal, in any quote. */
function typedWords(text: string): string[] {
  return Object.values(BLOCK_WORDS).filter((words) =>
    [`'${words}'`, `"${words}"`, `\`${words}\``, `>${words}<`].some((literal) => text.includes(literal)),
  );
}

describe('the words (owner-words.md rows 1-16)', () => {
  it('no BLOCK_WORDS value is typed under components/blocks, in flow-items.tsx or in Activity', () => {
    const found = DRAWN.flatMap((path) =>
      typedWords(readFileSync(resolve(__dirname, '..', path), 'utf8')).map((words) => `${path}: ${words}`),
    );
    expect(found).toEqual([]);
  });

  it('a planted literal is found, in each quote', () => {
    expect(typedWords("placeholder={'Search runs'}")).toEqual(['Search runs']);
    expect(typedWords('<Text>Default order</Text>')).toEqual(['Default order']);
    expect(typedWords('label: "Next",')).toEqual(['Next']);
    expect(typedWords('label: BLOCK_WORDS.next,')).toEqual([]);
  });
});
