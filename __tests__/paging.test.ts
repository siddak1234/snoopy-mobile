import { collectPages } from '@/lib/platform/paging';

describe('collectPages', () => {
  it('follows nextCursor to the last page, sending each cursor back unchanged', async () => {
    const asked: (string | undefined)[] = [];
    const pages: Record<string, { items: number[]; nextCursor?: string }> = {
      first: { items: [1, 2], nextCursor: 'c/2 ?' },
      'c/2 ?': { items: [3], nextCursor: 'c3' },
      c3: { items: [4] },
    };
    const all = await collectPages(async (cursor) => {
      asked.push(cursor);
      return pages[cursor ?? 'first']!;
    });
    expect(all).toEqual([1, 2, 3, 4]);
    expect(asked).toEqual([undefined, 'c/2 ?', 'c3']);
  });
});
