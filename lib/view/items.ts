import {
  ITEM_NOT_READ,
  ITEM_READING,
  ITEM_READY,
  OTHER_LABEL,
  countOf,
  topScoreOf,
} from '@/lib/content/screen-states';
import type { AutomationItemField, AutomationItems, Item, Run } from '@/lib/platform/automations';
import { statusLabel } from '@/lib/view/status';

/**
 * A flow's items as the screens draw them (backend ADR-0046; Round 19, plan §5,
 * the same in the website): grouped, each row's line, the select's choices,
 * the values sent, and an item's runs ranked. Pure, so each rule is tested on
 * its own. No word or id of one flow here: the words are the manifest's.
 */

/** One group of the flow page's list: the `groupField` value it holds (none when the flow groups nothing), newest first. */
export type ItemGroup = { name: string | null; items: Item[] };

const newestFirst = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt);

/**
 * The flow page's list (plan §5.1): by `groupField`'s value — groups in the
 * order of that field's `options`, then the names typed for it A–Z, then the
 * items without one — rows newest first. A flow that declares no `groupField`
 * is one group with no name.
 */
export function groupItems(items: readonly Item[], declared: Pick<AutomationItems, 'groupField' | 'fields'>): ItemGroup[] {
  const key = declared.groupField;
  if (!key) return items.length > 0 ? [{ name: null, items: [...items].sort(newestFirst) }] : [];
  const options = declared.fields.find((field) => field.key === key)?.options ?? [];
  const byName = new Map<string, Item[]>();
  const none: Item[] = [];
  for (const item of items) {
    const name = item.fields[key]?.trim();
    if (!name) none.push(item);
    else byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  const typed = [...byName.keys()].filter((name) => !options.includes(name)).sort((a, b) => a.localeCompare(b));
  const groups: ItemGroup[] = [...options.filter((name) => byName.has(name)), ...typed].map((name) => ({
    name,
    items: byName.get(name)!.sort(newestFirst),
  }));
  if (none.length > 0) groups.push({ name: null, items: none.sort(newestFirst) });
  return groups;
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

/** One row of an item's ranked runs (plan §5.3). */
export type RankedRunView = {
  id: string;
  rank: number;
  title: string;
  score: string | null;
  line: string | null;
  /** A failed or cancelled run, dimmed after the scored ones. */
  dim: boolean;
};

/**
 * An item's runs as the platform ranks them — highest score first, the
 * unscored after, then newest (`readItem`) — numbered 1…n. A run still going
 * reads "Reading…" (it has no title yet); a succeeded one its title, its score
 * and its result line; a failed one its status and its failure line, dimmed.
 */
export function rankedRuns(runs: readonly Run[]): RankedRunView[] {
  return runs.map((run, index) => {
    const going = run.status === 'pending' || run.status === 'running';
    return {
      id: run.id,
      rank: index + 1,
      title: going ? ITEM_READING : (run.title ?? statusLabel(run.status)),
      score: !going && run.score !== undefined ? String(run.score) : null,
      line: run.status === 'succeeded' ? (run.resultSummary ?? null) : run.status === 'failed' ? (run.failureReason ?? null) : null,
      dim: run.status === 'failed' || run.status === 'cancelled',
    };
  });
}

/** Whether a page showing these is read again: an item still being read, or a run still going. */
export function itemsStillGoing(items: readonly Pick<Item, 'status'>[], runs: readonly Pick<Run, 'status'>[] = []): boolean {
  return items.some((item) => item.status === 'reading') || runs.some((run) => run.status === 'pending' || run.status === 'running');
}
