import type { RunDetail, RunDocument } from '@/lib/platform/runs';
import { DOCUMENT_FORMAT_LABEL, DOCUMENT_TYPE_LABEL, documentOf } from '@/lib/content/screen-states';

/** A file uploaded for the job, as the run's detail lists it (round 24; backend ADR-0045). */
export type RunFile = NonNullable<RunDetail['files']>[number];

/**
 * A run's documents, as the run page's DOCUMENTS cards draw them (Build 21,
 * spec A7; backend ADR-0039 — `RunDocument`, the one shape at every hop). The
 * owner's ~04:05Z: "it was 3 receipts in one picture. that should work … we
 * should get a json out that clearly seperates accordingly … its possible
 * different receipts from different vendors is there. cu price, location, and
 * more should be there."
 *
 * Every value is the automation's, as printed; nothing is computed or rounded.
 * Money is drawn by hand from the decimal string — as every figure in this app
 * is (`lib/view/format.ts`: Hermes ships a subset of `Intl` that varies by
 * build): "$17.19" in US dollars or when the document names no currency, at
 * least two decimals and every digit printed ("$3.459"), else the amount and
 * its code ("17.19 CAD"), as the results email writes a total (spec C3).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What each document type is called on its card (spec A7; the email's words, C3). */
const TYPE_WORDS: Record<RunDocument['type'], string> = {
  bill: 'Bill',
  invoice: 'Invoice',
  receipt: 'Receipt',
  credit_note: 'Credit note',
  statement: 'Statement',
  bank_statement: 'Bank statement',
  quote: 'Quote',
  purchase_order: 'Purchase order',
  other: 'Document',
};

/**
 * The chip on each card (spec A7); `Not approved` for a waiting one whose
 * approval was refused or ran out (S21). ~~Skipped~~ is gone with the owner's
 * AM6–AM8 (~22:15Z, ~22:35Z): every financial document goes through, and only
 * a page that is clearly not one waits.
 */
const STATUS_CHIPS: Record<RunDocument['status'], string> = {
  recorded: 'Recorded',
  saved: 'Saved',
  not_recorded: 'Not recorded',
  unconfirmed: 'Not confirmed',
  compared: 'Compared',
  waiting: 'Waiting',
};

const PAYMENT_WORDS: Record<Exclude<RunDocument['payment']['method'], 'not_shown'>, string> = {
  card: 'Card',
  cash: 'Cash',
  check: 'Check',
  bank_transfer: 'Bank transfer',
  other: 'Other',
};

/** The tone of a card's chip: done, waiting on someone, or not done. */
export type DocumentTone = 'ok' | 'warn' | 'muted';

const STATUS_TONES: Record<RunDocument['status'], DocumentTone> = {
  recorded: 'ok',
  saved: 'ok',
  compared: 'ok',
  not_recorded: 'warn',
  unconfirmed: 'warn',
  waiting: 'warn',
};

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/**
 * A decimal string as money, by hand and exact: "17.19" → "$17.19", "3.5" →
 * "$3.50", "3.459" → "$3.459", "-4.00" → "−$4.00", "1234.5" in CAD →
 * "1,234.5 CAD". Null, or a value not a decimal string, is null — never "NaN".
 */
export function documentMoney(value: string | null, currency: string | null): string | null {
  if (value === null) return null;
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const negative = sign === '-' ? '−' : '';
  if (currency === null || currency === 'USD') {
    const cents = fraction.padEnd(2, '0');
    return `${negative}$${grouped(whole!)}.${cents}`;
  }
  return `${negative}${grouped(whole!)}${fraction ? `.${fraction}` : ''} ${currency}`;
}

/** A printed date, YYYY-MM-DD, as the app says a day: "Oct 14, 2026" — no zone, so never a day off. */
export function documentDate(value: string | null): string | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value) : null;
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : null;
}

/** A printed time, 24-hour HH:MM, as the app says one: "2:32 PM". */
export function documentTime(value: string | null): string | null {
  const match = value ? /^([01][0-9]|2[0-3]):([0-5][0-9])$/u.exec(value) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}

export type DocumentLineView = { description: string; amount: string | null; each: string | null };
export type DocumentRowView = { label: string; value: string; strong?: true };

/** One document's card. */
export type DocumentCardView = {
  index: number;
  /** "Invoice 1 of 3" (round 24 P10). */
  heading: string;
  /** The closed card's one line, `{vendor} · {total}` (S9: three closed rows reading the same would hide which is which). */
  summary: string;
  chip: string;
  tone: DocumentTone;
  /** `{Type} · {vendor}`, or the type alone when no seller was read. */
  title: string;
  /** `{address}, {city} · Store {number}` — the parts printed. */
  location: string | null;
  /** `{date} · {time}` — the parts printed. */
  when: string | null;
  /**
   * The numbers that match it to its record (the owner's AM7, ~22:35Z: "ensure
   * invoice number, bill number, or another standard practice from vendors is
   * part of the json schema output. thats how we know which bill is what from
   * records"): its own number under its printed label — "Invoice #", "Bill
   * No.", else "No." — then every other identifier printed, by its label.
   */
  ids: DocumentRowView[];
  lines: DocumentLineView[];
  /** Said when the document has more lines than were read. */
  moreLines: boolean;
  /** What opens the card (round 24 P10): Document type, and Format when the file is known. */
  kind: DocumentRowView[];
  /** Subtotal, Tax, Tip, Discount, Total (medium), Paid, Result, then the automation's own details. */
  rows: DocumentRowView[];
};

/**
 * A file's format as a person reads it (round 24 P10): PDF, JPEG, PNG or HEIC,
 * otherwise the content type's subtype in capitals — the platform's own rule
 * for `RunFile.format`, for a file it sent without one.
 */
export function formatLabel(contentType: string): string {
  const subtype = contentType.split(';')[0]!.trim().toLowerCase().split('/')[1] ?? '';
  if (subtype === 'pdf') return 'PDF';
  if (subtype === 'jpeg' || subtype === 'jpg' || subtype === 'pjpeg') return 'JPEG';
  if (subtype === 'png') return 'PNG';
  if (subtype === 'heic' || subtype === 'heif') return 'HEIC';
  return subtype.toUpperCase();
}

/**
 * The format of the file a document was read from (round 24 P10): the file its
 * `source` names (Invoice Processing v6), else the job's only file (one file
 * per run until v6), else none — and the row is left out.
 */
export function formatFor(document: Pick<RunDocument, 'source'>, files: readonly RunFile[] | undefined): string | null {
  const list = files ?? [];
  const file = document.source ? list.find((candidate) => candidate.id === document.source!.file) : list.length === 1 ? list[0] : undefined;
  if (!file) return null;
  return file.format || formatLabel(file.contentType) || null;
}

/**
 * A document's card (spec A7): "Invoice 1 of 3" and its chip, `{vendor} ·
 * {total}` while it is closed (round 24 P10); open, the type and seller; where;
 * when; its numbers; each line — description, amount, and "{quantity} × {unit
 * price}" under it when both were printed; the totals, how it was paid ("Card
 * ending 4417", none when not shown), what happened to it and the automation's
 * own detail lines — opened by Document type and Format.
 */
export function toDocumentCard(
  document: RunDocument,
  count: number,
  approval?: 'rejected' | 'expired' | null,
  files?: readonly RunFile[],
): DocumentCardView {
  const money = (value: string | null) => documentMoney(value, document.currency);
  const notApproved = document.status === 'waiting' && (approval === 'rejected' || approval === 'expired');
  const type = TYPE_WORDS[document.type] ?? 'Document';
  const place = [document.vendor.address, document.vendor.city].filter(Boolean).join(', ');
  const location = [place || null, document.vendor.storeNumber ? `Store ${document.vendor.storeNumber}` : null]
    .filter(Boolean)
    .join(' · ');
  const when = [documentDate(document.date), documentTime(document.time)].filter(Boolean).join(' · ');
  const ids: DocumentRowView[] = [
    ...(document.number ? [{ label: document.numberLabel ?? 'No.', value: document.number }] : []),
    ...document.references.map((reference) => ({ label: reference.label, value: reference.value })),
  ];
  const kind: DocumentRowView[] = [{ label: DOCUMENT_TYPE_LABEL, value: type }];
  const format = formatFor(document, files);
  if (format) kind.push({ label: DOCUMENT_FORMAT_LABEL, value: format });
  const rows: DocumentRowView[] = [];
  const amount = (label: string, value: string | null, strong?: true) => {
    const text = money(value);
    if (text !== null) rows.push({ label, value: text, ...(strong ? { strong } : {}) });
  };
  amount('Subtotal', document.subtotal);
  amount('Tax', document.tax);
  amount('Tip', document.tip);
  const discount = money(document.discount);
  if (discount !== null) rows.push({ label: 'Discount', value: discount.startsWith('−') ? discount : `−${discount}` });
  amount('Total', document.total, true);
  if (document.payment.method !== 'not_shown') {
    rows.push({
      label: 'Paid',
      value:
        document.payment.method === 'card' && document.payment.cardLast4
          ? `Card ending ${document.payment.cardLast4}`
          : PAYMENT_WORDS[document.payment.method],
    });
  }
  rows.push({ label: 'Result', value: document.statusText });
  for (const detail of document.details) rows.push({ label: detail.label, value: detail.value });
  const total = money(document.total);
  return {
    index: document.index,
    heading: documentOf(document.index, count),
    summary: [document.vendor.name ?? type, total].filter(Boolean).join(' · '),
    chip: notApproved ? 'Not approved' : STATUS_CHIPS[document.status],
    tone: notApproved ? 'muted' : STATUS_TONES[document.status],
    title: document.vendor.name ? `${type} · ${document.vendor.name}` : type,
    location: location || null,
    when: when || null,
    ids,
    lines: document.lineItems.map((line) => {
      const quantity = line.quantity;
      const unit = money(line.unitPrice);
      return {
        description: line.description ?? '—',
        amount: money(line.amount),
        each: quantity !== null && unit !== null ? `${quantity} × ${unit}` : null,
      };
    }),
    moreLines: !document.lineItemsComplete,
    kind,
    rows,
  };
}

/** Every document's card, in the file's order; `files`, the job's uploads, give each its Format. */
export function toDocumentCards(
  documents: readonly RunDocument[] | undefined,
  approval?: 'rejected' | 'expired' | null,
  files?: readonly RunFile[],
): DocumentCardView[] {
  const list = [...(documents ?? [])].sort((a, b) => a.index - b.index);
  return list.map((document) => toDocumentCard(document, list.length, approval, files));
}

/**
 * The JSON file's name: `run-{the full run id}.json` (the owner's AM2, ~22:15Z:
 * "runs should have the full ID"; ~~the first eight~~ of the spec's S4).
 */
export function documentsFileName(runId: string): string {
  return `run-${runId}.json`;
}
