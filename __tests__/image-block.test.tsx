import { act, fireEvent, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FILE_GONE, FILE_NOT_OPENED, FILE_OPENING, TRY_AGAIN_LABEL } from '@/lib/content/screen-states';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { fileLinkFor, fixtureBlock, renderBlocks, savedFiles, visibleWords } from '@/test/blocks';
import { fakePlatform } from '@/test/fake-platform';
import { TEST_WORKSPACE } from '@/test/platform';
import { mockRouter } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  downloadSignedFile: jest.fn(),
}));
const { platformOperation, downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * The picture (backend ADR-0048 amendment 1, point 2), drawn from the
 * platform's own fixtures (`drawn-image.json`, `drawn-image-pdf.json`): its
 * file read for the typed target in the page's workspace, saved in a folder
 * of its own, drawn — a photo as React Native's `Image` read as its `alt`, a
 * scanned page in the file page's frame with no JavaScript — and the file
 * page's words, its own constants, while it comes or when it cannot.
 */

const RUN_FILE = 'GET /v1/workspaces/{workspaceId}/runs/{runId}/files/{fileId}' as const;
const photo = fixtureBlock('drawn-image', 'image');
const scan = fixtureBlock('drawn-image-pdf', 'image');
let saved: ReturnType<typeof savedFiles>;

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  saved = savedFiles(downloadSignedFile);
});

const draw = (block: typeof photo) => renderBlocks([block], { workspaceId: TEST_WORKSPACE });

describe('a picture', () => {
  it('while its file is read: "Opening the file…"', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(RUN_FILE, () => new Promise(() => undefined));
    await draw(photo);
    expect(visibleWords(screen.toJSON())).toEqual([FILE_OPENING]);
  });

  it('a file no longer kept (404): "This file is no longer kept.", no Try again', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(RUN_FILE, () => {
      throw new PlatformError('Not Found', 404);
    });
    await draw(photo);
    expect(await screen.findByText(FILE_GONE)).toBeTruthy();
    expect(screen.queryByText(TRY_AGAIN_LABEL)).toBeNull();
  });

  it('any other failure: "Could not open the file. Try again." and Try again, which reads the file again', async () => {
    const fake = fakePlatform(platformOperation);
    let reads = 0;
    fake.always(RUN_FILE, () => {
      reads += 1;
      if (reads === 1) throw new PlatformError('Bad Gateway', 502);
      return fileLinkFor(photo.file);
    });
    await draw(photo);
    expect(await screen.findByText(FILE_NOT_OPENED)).toBeTruthy();
    await fireEvent.press(screen.getByText(TRY_AGAIN_LABEL));
    expect(await screen.findByTestId('b-0-picture')).toBeTruthy();
    expect(fake.to(RUN_FILE)).toHaveLength(2);
  });

  it('a JPEG: an Image read as its alt, from the file saved in a folder of its own; a press opens the file page; the folder goes when the page closes', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(RUN_FILE, fileLinkFor(photo.file));
    const view = await draw(photo);
    const image = await screen.findByTestId('b-0-picture');
    expect(image.props.accessible).toBe(true);
    expect(image.props.accessibilityRole).toBe('image');
    expect(image.props.accessibilityLabel).toBe(photo.alt);
    expect(image.props.resizeMode).toBe('contain');
    expect(image.props.source).toEqual({ uri: 'file:///cache/view-1/view.jpg' });
    // Read for the typed target, in the page's workspace.
    expect(fake.to(RUN_FILE)[0]!.values).toEqual({
      workspaceId: TEST_WORKSPACE,
      runId: photo.open.target === 'run-file' ? photo.open.runId : '',
      fileId: photo.open.target === 'run-file' ? photo.open.fileId : '',
    });
    expect(downloadSignedFile).toHaveBeenCalledWith(`https://files.example.com/${photo.file.id}`, 'view.jpg', { freshFolder: true });
    await fireEvent.press(screen.getByTestId('b-0-open'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      { pathname: '/(tabs)/activity/run-file', params: { runId: (photo.open as { runId: string }).runId, fileId: photo.file.id } },
      undefined,
    );
    expect(saved[0]!.delete).not.toHaveBeenCalled();
    await act(async () => view.unmount());
    expect(saved[0]!.delete).toHaveBeenCalledTimes(1);
  });

  it('a PDF: the file page\'s frame, no JavaScript, reading its own folder only, read as its alt', async () => {
    const fake = fakePlatform(platformOperation);
    fake.always(RUN_FILE, fileLinkFor(scan.file));
    await draw(scan);
    const page = await screen.findByTestId('b-0-page');
    expect(page.props.javaScriptEnabled).toBe(false);
    expect(page.props.accessibilityLabel).toBe(scan.alt);
    expect(page.props.source).toEqual({ uri: 'file:///cache/view-1/view.pdf' });
    expect(page.props.allowingReadAccessToURL).toBe('file:///cache/view-1/');
    expect(screen.queryByTestId('b-0-picture')).toBeNull();
  });

  it('its words are the file page\'s constants: image.tsx types none of them', () => {
    const source = readFileSync(resolve(__dirname, '../components/blocks/image.tsx'), 'utf8');
    for (const words of [FILE_OPENING, FILE_GONE, FILE_NOT_OPENED, TRY_AGAIN_LABEL]) {
      expect(source).not.toContain(words);
    }
    expect(source).toContain('FILE_OPENING');
    expect(source).toContain('FILE_GONE');
    expect(source).toContain('FILE_NOT_OPENED');
    expect(source).toContain('TRY_AGAIN_LABEL');
  });
});
