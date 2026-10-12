import { UPLOAD_REFUSALS, uploadRefusalMessage } from '@/lib/content/refusals';
import { PlatformError } from '@/lib/platform/problem';

/**
 * A run's file refused by the platform, in words (FR-14), including the five
 * reasons it gives since it measures a file when its upload is sealed (backend
 * BUILD-PLAN 25.2.28) — the website's sentences and its rule for the numbers
 * (`snoopy/test/upload-refusals.test.mjs`). The field showing them is held by
 * `start-run.test.tsx`.
 */

const refused = (details: Record<string, unknown>) => new PlatformError('Bad Request', 400, 'BAD_REQUEST', details);
const FALLBACK = 'The file could not be sent.';

describe('a refused upload, in words', () => {
  it("names a measured file's numbers when the platform sends them", () => {
    expect(uploadRefusalMessage(refused({ reason: 'file_too_many_pages', pageCount: '14', maximumPdfPages: '10' }), FALLBACK)).toBe(
      'This PDF has 14 pages. This flow reads at most 10.',
    );
    expect(
      uploadRefusalMessage(
        refused({ reason: 'file_image_too_large', widthPixels: '9000', heightPixels: '120', maximumImageSidePixels: '8000' }),
        FALLBACK,
      ),
    ).toBe('This image is 9000 × 120 pixels. This flow takes images up to 8000 pixels on a side.');
  });

  it.each([undefined, '', '14 pages', '-3', '1e3', '<b>14</b>', '12345678901'])(
    'never shows a page count that is not a whole number (%p): the sentence without numbers is said',
    (pageCount) => {
      expect(uploadRefusalMessage(refused({ reason: 'file_too_many_pages', pageCount, maximumPdfPages: '10' }), FALLBACK)).toBe(
        'This PDF has more pages than this flow reads.',
      );
    },
  );

  it('says the plain sentence for an image when a side is missing', () => {
    expect(
      uploadRefusalMessage(refused({ reason: 'file_image_too_large', widthPixels: '9000', maximumImageSidePixels: '8000' }), FALLBACK),
    ).toBe('This image is larger than this flow takes.');
  });

  it('says every named reason in its words, and leaves any other to the platform', () => {
    for (const [reason, words] of Object.entries(UPLOAD_REFUSALS)) {
      expect(uploadRefusalMessage(refused({ reason }), FALLBACK)).toBe(words);
    }
    for (const reason of ['a_reason_not_named_here', 'toString', '__proto__', undefined, 42]) {
      expect(uploadRefusalMessage(refused({ reason }), FALLBACK)).toBe('Bad Request');
    }
    expect(uploadRefusalMessage(new Error(''), FALLBACK)).toBe(FALLBACK);
  });

  it('names the five reasons the platform added, beside the seven before them', () => {
    expect(Object.keys(UPLOAD_REFUSALS)).toEqual([
      'content_type_not_accepted',
      'file_too_large',
      'subscription_not_live',
      'no_file_input',
      'session_expired',
      'no_object',
      'too_large',
      'file_too_many_pages',
      'file_image_too_large',
      'file_content_mismatch',
      'file_encrypted',
      'file_unreadable',
    ]);
  });
});
