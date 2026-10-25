import {
  FILE_WORD,
  ITEM_NOT_READ,
  ITEM_READING,
  ITEM_READY,
  OTHER_LABEL,
  TOTAL_LABEL,
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
import { statusLabel } from '@/lib/view/status';

/**
 * A flow's items as the screens draw them (backend ADR-0046; Round 19, plan §5,
 * the same in the website): grouped, the filter's choices, each row's line,
 * the select's choices, the values sent, and an item's runs ranked. Pure, so each rule is tested on
 * its own. No word or id of one flow here: the words are the manifest's.
 */

/** One group of the flow page's list: the `groupField` value it holds (none when the flow groups nothing, or for the items without one). */
export type ItemGroup = { name: string | null; items: Item[] };

/** The filter's first choice, every group: never one of a flow's values, which are words. */
export const ALL_GROUPS = '\u0000all';

const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title);

/** Each item's `groupField` value, trimmed; none for a flow that groups nothing or an item without one. */
function groupOf(item: Item, key: string | undefined): string | null {
  return (key ? item.fields[key]?.trim() : undefined) || null;
}

/**
 * The flow page's list (the owner's build 28 items F2–F3; Round 19, plan §3):
 * by `groupField`'s value, the groups A–Z, then the items without one — each
 * group's items A–Z by title. `shown`, a value the filter chose, keeps that
 * group alone; `ALL_GROUPS` (or none) keeps every one. A flow that declares no
 * `groupField` is one group with no name.
 */
export function groupItems(
  items: readonly Item[],
  declared: Pick<AutomationItems, 'groupField'>,
  shown: string = ALL_GROUPS,
): ItemGroup[] {
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
    .map((name) => ({ name, items: byName.get(name)!.sort(byTitle) }));
  if (none.length > 0) groups.push({ name: null, items: none.sort(byTitle) });
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

/** One row of an item's ranked runs (the owner's build 28 item F5: rank, name, score, arrow). */
export type RankedRunView = {
  id: string;
  rank: number;
  title: string;
  score: string | null;
  /** A failed or cancelled run: drawn in the muted tone (never faded). */
  dim: boolean;
};

/**
 * An item's runs as the platform ranks them — highest score first, the
 * unscored after, then newest (`readItem`) — numbered 1…n. A run still going
 * reads "Reading…" (it has no title yet); a succeeded one its title and its
 * score; a failed one its status, muted. ~~Its result or failure line under
 * it~~ until build 28 (F5: "the size of the must haves drop down").
 */
export function rankedRuns(runs: readonly Run[]): RankedRunView[] {
  return runs.map((run, index) => {
    const going = run.status === 'pending' || run.status === 'running';
    return {
      id: run.id,
      rank: index + 1,
      title: going ? ITEM_READING : (run.title ?? statusLabel(run.status)),
      score: !going && run.score !== undefined ? String(run.score) : null,
      dim: run.status === 'failed' || run.status === 'cancelled',
    };
  });
}

/** Whether a page showing these is read again: an item still being read, or a run still going. */
export function itemsStillGoing(items: readonly Pick<Item, 'status'>[], runs: readonly Pick<Run, 'status'>[] = []): boolean {
  return items.some((item) => item.status === 'reading') || runs.some((run) => run.status === 'pending' || run.status === 'running');
}

/** One of an item's tiles (the owner's build 28 item F6): its count, its word, and its tone. */
export type ItemTile = { key: 'total' | 'positive' | 'negative'; label: string; value: string; tone: 'text' | 'ok' | 'err' };

/**
 * An item's tiles (F6: "total candidates, green … the hireable ones and red …
 * do not hire"): Total — its runs — then its `positiveCount` and
 * `negativeCount` in the flow's own `verdictWords`, green and red. None for a
 * flow whose items declare no verdict words: it gives no verdict to count.
 */
export function itemTiles(
  item: Pick<Item, 'runCount' | 'positiveCount' | 'negativeCount'>,
  verdictWords: AutomationItems['verdictWords'],
): ItemTile[] {
  if (!verdictWords) return [];
  return [
    { key: 'total', label: TOTAL_LABEL, value: String(item.runCount), tone: 'text' },
    { key: 'positive', label: verdictWords.positive, value: String(item.positiveCount), tone: 'ok' },
    { key: 'negative', label: verdictWords.negative, value: String(item.negativeCount), tone: 'err' },
  ];
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
