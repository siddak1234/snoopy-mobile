import { BLOCK_LIST_RULES, BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';

/**
 * Search, sort and pages (backend ADR-0048 amendment 1, point 4; the owner's
 * words rows 1–16): the rules both clients copy from the platform's cases
 * (`snoopy-backend/packages/contracts/fixtures/block-rules/search.json` and `sort.json`, generated into
 * `block-rules.ts`; `__tests__/block-sort.test.ts` runs every one). One page
 * size and one threshold, `BLOCK_LIST_RULES.pageSize` (25): a list or table is
 * long above it. Every word is `BLOCK_WORDS`', filled in here, never typed.
 * Pure, so each rule is tested on its own; the website's `snoopy/lib/block-sort.ts`.
 */

export const PAGE_SIZE = BLOCK_LIST_RULES.pageSize;
/** The longest query the platform takes (`q`, 1–80). */
export const QUERY_LENGTH = BLOCK_LIST_RULES.queryLength;

/** Whether a list of `count` rows is long: sort and pages show (search too, inside a run's blocks). */
export const isLong = (count: number) => count > PAGE_SIZE;

/** A pattern's `{name}` parts filled in: `fill(BLOCK_WORDS.pageOf, { n: 2, total: 5 })` is "Page 2 of 5". */
export function fill(pattern: string, values: Readonly<Record<string, string | number>>): string {
  return pattern.replace(/\{(\w+)\}/gu, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

/** A text as search compares it: accents removed (NFD, combining marks out), lower case. */
export function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
}

/**
 * The rows a query finds: trimmed, case-free, accents removed, "contains" over
 * any of a row's fields; an empty query (or one of spaces) finds every row.
 */
export function search<T>(rows: readonly T[], query: string, fields: (row: T) => readonly (string | undefined | null)[]): T[] {
  const wanted = folded(query.trim());
  if (wanted === '') return [...rows];
  return rows.filter((row) => fields(row).some((field) => typeof field === 'string' && folded(field).includes(wanted)));
}

/**
 * The number rule: `$ € £ ,`, spaces and one trailing `%` removed, then a
 * plain number (`^-?\d+(\.\d+)?$`); anything else is no number.
 */
export function numberOf(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const bare = value.replace(/[$€£,\s]/gu, '').replace(/%$/u, '');
  return /^-?\d+(\.\d+)?$/u.test(bare) ? Number(bare) : undefined;
}

/** A sort key: a number sorts high to low, a word A to Z, none goes last. */
type Key = (at: number) => number | string | undefined;

/** One sort choice: its value for the drop-down, its words, and its key. */
export type SortChoice = { value: string; label: string; key: Key };

/** The value of "Default order": the order the flow sent, or the platform's rank. */
export const DEFAULT_ORDER = 'default';

const defaultOrder: SortChoice = { value: DEFAULT_ORDER, label: BLOCK_WORDS.defaultOrder, key: () => undefined };

/** A list's row as the sort reads it. */
export type SortListRow = { title: string; value?: string; valueLabel?: string };

/**
 * A long list's choices: "Default order", "A to Z" (its titles), then
 * "{valueLabel}: high to low" when at least one row has a value, every value
 * reads as a number, and all of them share one `valueLabel`.
 */
export function listChoices(rows: readonly SortListRow[]): SortChoice[] {
  const choices: SortChoice[] = [defaultOrder, { value: 'title', label: BLOCK_WORDS.aToZ, key: (at) => rows[at]!.title }];
  const valued = rows.filter((row) => row.value !== undefined && row.value !== '');
  const labels = new Set(valued.map((row) => row.valueLabel));
  const [label] = [...labels];
  if (valued.length > 0 && valued.every((row) => numberOf(row.value) !== undefined) && labels.size === 1 && label) {
    choices.push({
      value: 'value',
      label: fill(BLOCK_WORDS.highToLow, { label }),
      key: (at) => numberOf(rows[at]!.value),
    });
  }
  return choices;
}

/**
 * A long table's choices: "Default order", then each titled column — "{title}:
 * high to low" when every non-empty cell reads as a number, else "{title}: A to
 * Z". An untitled column gets none. Empty cells go last.
 */
export function tableChoices(
  columns: readonly ({ title?: string | null } | string | null | undefined)[],
  rows: readonly (readonly string[])[],
): SortChoice[] {
  const choices: SortChoice[] = [defaultOrder];
  columns.forEach((column, index) => {
    const title = typeof column === 'string' ? column : column?.title;
    if (!title) return;
    const cells = rows.map((row) => row[index] ?? '').filter((cell) => cell !== '');
    const numeric = cells.length > 0 && cells.every((cell) => numberOf(cell) !== undefined);
    choices.push({
      value: `column-${index}`,
      label: fill(numeric ? BLOCK_WORDS.columnHighToLow : BLOCK_WORDS.columnAToZ, { column: title }),
      key: (at) => {
        const cell = rows[at]?.[index] ?? '';
        if (cell === '') return undefined;
        return numeric ? numberOf(cell) : cell;
      },
    });
  });
  return choices;
}

/**
 * The rows' order under a choice, as indexes: numbers high to low, words A to
 * Z (`localeCompare('en-US', {sensitivity: 'base'})`), empty and missing last,
 * ties in the order sent. "Default order" is the order sent.
 */
export function sortedIndexes(count: number, choice: Pick<SortChoice, 'key'>): number[] {
  const indexes = Array.from({ length: count }, (_, at) => at);
  return indexes.sort((a, b) => {
    const left = choice.key(a);
    const right = choice.key(b);
    if (left === undefined || right === undefined) {
      return left === right ? 0 : left === undefined ? 1 : -1;
    }
    if (typeof left === 'number' && typeof right === 'number') return right - left;
    return String(left).localeCompare(String(right), 'en-US', { sensitivity: 'base' });
  });
}

/** How many pages `count` rows take, at least one. */
export function pageCount(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

/** A page number held within the pages there are. */
export function pageWithin(page: number, count: number): number {
  return Math.min(Math.max(1, page), pageCount(count));
}

/** One page's rows (1-based). */
export function pageRows<T>(rows: readonly T[], page: number): T[] {
  const at = (pageWithin(page, rows.length) - 1) * PAGE_SIZE;
  return rows.slice(at, at + PAGE_SIZE);
}
