import {
  FILE_WORD,
  ITEM_NOT_READ,
  ITEM_READING,
  ITEM_READY,
  OTHER_LABEL,
  allOf,
  countOf,
  topScoreOf,
  viewFileLabel,
} from '@/lib/content/screen-states';
import type {
  AutomationItemField,
  AutomationItems,
  AutomationRunInputField,
  Item,
  Run,
  RunFile,
} from '@/lib/platform/automations';
import { BLOCK_WORDS } from '@/lib/generated/platform-contracts/block-rules';
import { PAGE_SIZE, fill, isLong, pageCount, pageWithin, search } from '@/lib/view/block-sort';

/**
 * A flow's items as the screens draw them (backend ADR-0046; Round 19, plan §5,
 * the same in the website): grouped, the filter's choices, each row's line,
 * the select's choices, the values sent, and a run's files. Pure, so each rule is tested on
 * its own. ~~An item's tiles and its runs ranked (`itemTiles`, `rankedRuns`)~~ until
 * Round 21: the platform's blocks now (backend ADR-0048). No word or id of one flow here: the words are the manifest's.
 */

/** One group of the flow page's list: the `groupField` value it holds (none when the flow groups nothing, or for the items without one). */
export type ItemGroup = { name: string | null; items: Item[] };

/** The filter's first choice, every group: never one of a flow's values, which are words. */
export const ALL_GROUPS = '\u0000all';

const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title);
/** The platform's order of a flow's items, newest first (`createdAt`), ties by title. */
const byNewest = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt) || byTitle(a, b);

/**
 * How a flow's items are ordered inside each group (Round 21, ADR-0048
 * amendment 1, point 4): "A to Z" by title (today's order), or "Newest first".
 */
export type ItemOrder = 'title' | 'newest';

/** The sort's two choices, shown when the flow holds more than 25 items. */
export const ITEM_ORDERS: readonly { value: ItemOrder; label: string }[] = [
  { value: 'title', label: BLOCK_WORDS.aToZ },
  { value: 'newest', label: BLOCK_WORDS.newestFirst },
];

/** The search box's hint over a flow's items: "Search {items}", the flow's word for many, in lower case. */
export function searchItemsHint(words: Pick<AutomationItems['words'], 'plural'>): string {
  return fill(BLOCK_WORDS.searchItems, { items: words.plural.toLocaleLowerCase('en-US') });
}

/** The items a search finds, by title: trimmed, case-free, accents removed (`search`). */
export function searchItems(items: readonly Item[], query: string): Item[] {
  return search(items, query, (item) => [item.title]);
}

/** Whether the flow page draws the sort and the pages: more than 25 items. */
export const itemsAreLong = (count: number) => isLong(count);

/**
 * One page of the grouped list: the groups' items in their order, page `page`
 * of 25, each kept under its group's name — a group that falls across two
 * pages is named on both. The page number held within the pages there are.
 */
export function pageOfGroups(groups: readonly ItemGroup[], page: number): { groups: ItemGroup[]; page: number; pages: number } {
  const flat = groups.flatMap((group) => group.items.map((item) => ({ name: group.name, item })));
  const pages = pageCount(flat.length);
  const at = pageWithin(page, flat.length);
  const slice = flat.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);
  const out: ItemGroup[] = [];
  for (const { name, item } of slice) {
    const last = out[out.length - 1];
    if (last && last.name === name) last.items.push(item);
    else out.push({ name, items: [item] });
  }
  return { groups: out, page: at, pages };
}

/** Each item's `groupField` value, trimmed; none for a flow that groups nothing or an item without one. */
function groupOf(item: Item, key: string | undefined): string | null {
  return (key ? item.fields[key]?.trim() : undefined) || null;
}

/**
 * The flow page's list (the owner's build 28 items F2–F3; Round 19, plan §3):
 * by `groupField`'s value, the groups A–Z, then the items without one — each
 * group's items A–Z by title, or newest first (`order`, Round 21). `shown`, a
 * value the filter chose, keeps that group alone; `ALL_GROUPS` (or none) keeps
 * every one. A flow that declares no `groupField` is one group with no name.
 */
export function groupItems(
  items: readonly Item[],
  declared: Pick<AutomationItems, 'groupField'>,
  shown: string = ALL_GROUPS,
  order: ItemOrder = 'title',
): ItemGroup[] {
  const within = order === 'newest' ? byNewest : byTitle;
  const key = declared.groupField;
  const byName = new Map<string, Item[]>();
  const none: Item[] = [];
  for (const item of items) {
    const name = groupOf(item, key);
    if (name === null) none.push(item);
    else byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  const groups: ItemGroup[] = [...byName.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, items: byName.get(name)!.sort(within) }));
  if (none.length > 0) groups.push({ name: null, items: none.sort(within) });
  return shown === ALL_GROUPS ? groups : groups.filter((group) => group.name === shown);
}

/**
 * The flow page's filter (F2: "a drop down glass style like the others where
 * you can select the department"): "All {values}" first — the plural of the
 * group field's own title, as the manifest names it — then each value the
 * items hold, A–Z. None when the flow groups nothing or nothing is listed.
 */
export function itemGroupChoices(
  items: readonly Item[],
  declared: Pick<AutomationItems, 'groupField' | 'fields'>,
): { value: string; label: string }[] {
  const key = declared.groupField;
  const field = declared.fields.find((candidate) => candidate.key === key);
  if (!key || !field || items.length === 0) return [];
  const values = [...new Set(items.map((item) => groupOf(item, key)).filter((name): name is string => name !== null))];
  return [
    { value: ALL_GROUPS, label: allOf(field.title) },
    ...values.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
  ];
}

/** The filter's choice as drawn: the one picked while the list still holds it, else every group. */
export function shownGroup(choices: readonly { value: string }[], picked: string): string {
  return choices.some((choice) => choice.value === picked) ? picked : ALL_GROUPS;
}

/**
 * A row's line (plan §5.1): "4 {runs} · Top 86" once the file is read —
 * the count in the flow's run words, the top score when one has a score —
 * "Reading…" while it is read, "Couldn't read" when it was not.
 */
export function itemRowLine(item: Pick<Item, 'status' | 'runCount' | 'topScore'>, runWords: AutomationItems['runWords']): string {
  if (item.status === 'reading') return ITEM_READING;
  if (item.status === 'failed') return ITEM_NOT_READ;
  const count = countOf(item.runCount, runWords);
  return item.topScore === null ? count : `${count} · ${topScoreOf(item.topScore)}`;
}

/**
 * The item page's line under its title (plan §5.3): its group's value, then
 * where it is — "{group} · Ready", "Reading…", "Couldn't read: {reason}".
 */
export function itemStatusLine(item: Pick<Item, 'status' | 'failureReason' | 'fields'>, groupField?: string): string {
  const state =
    item.status === 'ready'
      ? ITEM_READY
      : item.status === 'reading'
        ? ITEM_READING
        : item.failureReason
          ? `${ITEM_NOT_READ}: ${item.failureReason}`
          : ITEM_NOT_READ;
  const group = groupField ? item.fields[groupField]?.trim() : undefined;
  return group ? `${group} · ${state}` : state;
}

/** The value "Other" stands for in a select: never one of a flow's options, which are words. */
export const OTHER_CHOICE = '\u0000other';

/**
 * A select's choices (plan §5.2): its `options`, then every value typed for it
 * before (`choices`, from the flow's items) that is not one of them, then
 * "Other" where it takes a typed value (`allowOther`).
 */
export function selectChoices(
  field: Pick<AutomationItemField, 'options' | 'allowOther'>,
  saved: readonly string[] | undefined,
): { value: string; label: string }[] {
  const options = field.options ?? [];
  const typed = (saved ?? []).filter((name, index, all) => !options.includes(name) && all.indexOf(name) === index);
  return [
    ...[...options, ...typed].map((name) => ({ value: name, label: name })),
    ...(field.allowOther ? [{ value: OTHER_CHOICE, label: OTHER_LABEL }] : []),
  ];
}

/** Where the upload card starts: each select at its default, every text box empty. */
export function initialItemValues(fields: readonly AutomationItemField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) values[field.key] = field.control === 'select' ? (field.defaultValue ?? '') : '';
  return values;
}

/**
 * What `createItem` is sent as `fields`: each select's choice — or, on "Other",
 * what was typed — and each text box, trimmed; an empty one is left out, so the
 * platform applies the field's default or refuses a required one.
 */
export function itemFieldValues(
  fields: readonly AutomationItemField[],
  values: Readonly<Record<string, string>>,
  others: Readonly<Record<string, string>>,
): Record<string, string> {
  const sent: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.key] === OTHER_CHOICE ? others[field.key] : values[field.key];
    const value = raw?.trim();
    if (value) sent[field.key] = value;
  }
  return sent;
}

/** Whether every required field holds a value or has a default to fall back on. */
export function itemFieldsComplete(
  fields: readonly AutomationItemField[],
  values: Readonly<Record<string, string>>,
  others: Readonly<Record<string, string>>,
): boolean {
  const sent = itemFieldValues(fields, values, others);
  return fields.every((field) => !field.required || sent[field.key] !== undefined || field.defaultValue !== undefined);
}

/** The longest value a field takes: a text field's `maxLength` (80 when absent), a typed select value's 40. */
export function itemFieldLimit(field: Pick<AutomationItemField, 'control' | 'maxLength'>): number {
  return field.control === 'text' ? (field.maxLength ?? 80) : 40;
}

/** Whether a page showing these is read again: an item still being read, or a run still going. */
export function itemsStillGoing(items: readonly Pick<Item, 'status'>[], runs: readonly Pick<Run, 'status'>[] = []): boolean {
  return items.some((item) => item.status === 'reading') || runs.some((run) => run.status === 'pending' || run.status === 'running');
}

/** One "View {file}" row of a run's page: the file it opens and its words. */
export type RunFileRow = { id: string; label: string; title: string };

/**
 * A run's files as its page offers them (the owner's build 28 item F7: "the
 * first section should be the view resume button"): one row per file the job
 * uploaded (`RunDetail.files`, in upload order), each named by its flow's file
 * field — the run's `artifact` fields of `runInput`, in order, the first for any
 * file past them; "File" when the flow names none — "View resume"; files that
 * share a word say which they are, "View photo 1 of 2".
 */
export function runFileRows(
  files: readonly Pick<RunFile, 'id'>[] | undefined,
  runInput: readonly Pick<AutomationRunInputField, 'control' | 'title'>[] | undefined,
): RunFileRow[] {
  const fields = (runInput ?? []).filter((field) => field.control === 'artifact');
  const titles = (files ?? []).map((_, index) => (fields[index] ?? fields[0])?.title ?? FILE_WORD);
  return (files ?? []).map((file, index) => {
    const title = titles[index]!;
    const same = titles.filter((other) => other === title).length;
    const at = titles.slice(0, index + 1).filter((other) => other === title).length;
    const label = viewFileLabel(title);
    return { id: file.id, title, label: same > 1 ? `${label} ${at} of ${same}` : label };
  });
}

/**
 * The types a file page draws in place, by `contentType` — never by the name
 * its uploader gave it — each saved under its own extension (build 28's review,
 * finding 5; the website's `shownInPlace`): a PDF, a JPEG, a PNG. Any other is
 * downloaded to be opened.
 */
const SHOWN_IN_PLACE: Readonly<Record<string, string>> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** The name a file is saved under to be drawn in place, from its type; none for a type not drawn. */
export function viewName(contentType: string): string | null {
  const extension = SHOWN_IN_PLACE[contentType.split(';')[0]!.trim().toLowerCase()];
  return extension ? `view.${extension}` : null;
}

/** A file's size in words, as the website says it: "24 KB", "1.2 MB". */
export function sizeInWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A file's line under its name, the website's `fileLine`: its format, its pages when measured, its size. */
export function fileLine(file: Pick<RunFile, 'format' | 'pages' | 'sizeBytes'>): string {
  const pages = file.pages === null ? null : `${file.pages} ${file.pages === 1 ? 'page' : 'pages'}`;
  return [file.format, pages, sizeInWords(file.sizeBytes)].filter(Boolean).join(' · ');
}
