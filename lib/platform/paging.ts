/**
 * Every page of a cursor-paged list (the contract's `nextCursor`, sent back
 * unchanged as `cursor`). Ported from `snoopy/lib/tenancy.ts` `collectPages`:
 * a screen shows the whole list, never its first page as if it were all.
 */
export async function collectPages<T>(
  readPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await readPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return items;
}
