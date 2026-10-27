import { Linking, Platform, Share } from 'react-native';

import { saveSignedFile, saveToFiles, sharesFiles, shareSignedFile, signedLink } from '@/lib/platform/signed-file';

jest.mock('@/lib/platform/client', () => ({
  downloadSignedFile: jest.fn(),
}));
const { downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * The folder the person picks in Files, as expo-file-system answers it: a
 * `Directory` of the picked folder's address (its src/FileSystem.ts:209-212,
 * `new Directory((await ExpoFileSystem.pickDirectoryAsync(initialUri)).uri)`),
 * and a closed picker's refusal, its iOS `FilePickingCancelledException`
 * (ios/FileSystemExceptions.swift:94-96, "File picking was cancelled by the
 * user"). The files in it are what `copy` put there.
 */
const picked = { uri: 'file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Downloads/' };
const mockCopies: string[] = [];
const mockTaken = new Set<string>();
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(uri: string | { uri: string }) {
      this.uri = typeof uri === 'string' ? uri : uri.uri;
    }
    static pickDirectoryAsync = jest.fn();
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('');
    }
    get exists() {
      return mockTaken.has(this.uri);
    }
    copy(target: { uri: string }) {
      mockCopies.push(`${this.uri} -> ${target.uri}`);
    }
  }
  return { Directory, File };
});
const { Directory } = jest.requireMock('expo-file-system');

/**
 * The one way the app hands on a file behind a signed link (the round 24
 * review's eighth finding; Round 21, the owner's Q7: Download, then Share):
 * `saveSignedFile` — Download — on iOS saves the file into the cache, then
 * into the folder picked in Files, and removes the cache's copy; on Android
 * it opens the link. `shareSignedFile` — Share — on iOS hands the file itself
 * to the share sheet, never the link, and removes it; elsewhere it does
 * nothing, as Share is not drawn there.
 */

const FILE = { downloadUrl: 'https://files.example.test/run.pdf?sig=1', filename: 'run-1.pdf' };
const os = Platform.OS;
let openURL: jest.SpyInstance;
let share: jest.SpyInstance;
let saved: { uri: string; exists: boolean; delete: jest.Mock };

beforeEach(() => {
  saved = { uri: 'file:///cache/run-1.pdf', exists: true, delete: jest.fn() };
  downloadSignedFile.mockReset().mockResolvedValue(saved);
  Directory.pickDirectoryAsync.mockReset().mockResolvedValue(new Directory(picked.uri));
  mockCopies.length = 0;
  mockTaken.clear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
});

afterEach(() => {
  Platform.OS = os;
  openURL.mockRestore();
  share.mockRestore();
});

describe('saveSignedFile (Download)', () => {
  it('on iOS saves the link into the cache, then into the folder picked in Files, under its name — no share sheet — and removes the cache copy', async () => {
    Platform.OS = 'ios';
    await saveSignedFile(FILE);
    expect(downloadSignedFile).toHaveBeenCalledWith(FILE.downloadUrl, 'run-1.pdf');
    expect(Directory.pickDirectoryAsync).toHaveBeenCalledTimes(1);
    expect(mockCopies).toEqual([`file:///cache/run-1.pdf -> ${picked.uri}run-1.pdf`]);
    expect(share).not.toHaveBeenCalled();
    expect(saved.delete).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('on iOS a name the folder holds already is saved as "name 2", then "name 3"', async () => {
    Platform.OS = 'ios';
    mockTaken.add(`${picked.uri}run-1.pdf`);
    mockTaken.add(`${picked.uri}run-1 2.pdf`);
    await saveSignedFile(FILE);
    expect(mockCopies).toEqual([`file:///cache/run-1.pdf -> ${picked.uri}run-1 3.pdf`]);
  });

  it('on iOS the picker closed saves nothing, says nothing, and still removes the cache copy', async () => {
    Platform.OS = 'ios';
    Directory.pickDirectoryAsync.mockRejectedValue(
      Object.assign(new Error('File picking was cancelled by the user'), { code: 'ERR_FILE_PICKING_CANCELLED' }),
    );
    await expect(saveSignedFile(FILE)).resolves.toBeUndefined();
    expect(mockCopies).toEqual([]);
    expect(saved.delete).toHaveBeenCalledTimes(1);
  });

  it('on iOS a folder that cannot be written is said to the screen, and the cache copy is removed', async () => {
    Platform.OS = 'ios';
    Directory.pickDirectoryAsync.mockRejectedValue(new Error('Missing permission'));
    await expect(saveSignedFile(FILE)).rejects.toThrow('Missing permission');
    expect(saved.delete).toHaveBeenCalledTimes(1);
  });

  it('on Android opens the link, saving nothing (today\'s)', async () => {
    Platform.OS = 'android';
    await saveSignedFile(FILE);
    expect(openURL).toHaveBeenCalledWith(FILE.downloadUrl);
    expect(downloadSignedFile).not.toHaveBeenCalled();
    expect(Directory.pickDirectoryAsync).not.toHaveBeenCalled();
  });
});

describe('shareSignedFile (Share)', () => {
  it('on iOS saves the link into the cache under its name, hands the FILE to the share sheet — its local address, never the signed link — then removes it', async () => {
    Platform.OS = 'ios';
    await shareSignedFile(FILE);
    expect(downloadSignedFile).toHaveBeenCalledWith(FILE.downloadUrl, 'run-1.pdf');
    expect(share).toHaveBeenCalledWith({ url: 'file:///cache/run-1.pdf' });
    expect(JSON.stringify(share.mock.calls)).not.toContain(FILE.downloadUrl);
    expect(saved.delete).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('on iOS removes the file even when the share sheet fails, and says the failure', async () => {
    Platform.OS = 'ios';
    share.mockRejectedValue(new Error('The share sheet closed.'));
    await expect(shareSignedFile(FILE)).rejects.toThrow('The share sheet closed.');
    expect(saved.delete).toHaveBeenCalledTimes(1);
  });

  it('on Android does nothing: its share sheet cannot carry the file, so Share is not drawn there', async () => {
    Platform.OS = 'android';
    expect(sharesFiles()).toBe(false);
    await shareSignedFile(FILE);
    expect(openURL).not.toHaveBeenCalled();
    expect(downloadSignedFile).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it('shares files on iOS only', () => {
    Platform.OS = 'ios';
    expect(sharesFiles()).toBe(true);
  });

  it.each(['ios', 'android'] as const)('on %s refuses a link that is not https: nothing opened, nothing saved', async (platform) => {
    Platform.OS = platform;
    for (const hand of [saveSignedFile, shareSignedFile]) {
      await expect(hand({ ...FILE, downloadUrl: 'http://files.example.test/run.pdf' })).rejects.toThrow('The link to the file cannot be used.');
    }
    expect(openURL).not.toHaveBeenCalled();
    expect(downloadSignedFile).not.toHaveBeenCalled();
  });
});

describe('saveToFiles', () => {
  it('copies a file into the picked folder; a name without an ending gets " 2" after it', async () => {
    const { File } = jest.requireMock('expo-file-system');
    mockTaken.add(`${picked.uri}notes`);
    await expect(saveToFiles(new File('file:///cache/notes'), 'notes')).resolves.toBe('saved');
    expect(mockCopies).toEqual([`file:///cache/notes -> ${picked.uri}notes 2`]);
  });
});

describe('signedLink', () => {
  it('passes an https link as it is and refuses any other, or no address at all', () => {
    expect(signedLink(FILE.downloadUrl)).toBe(FILE.downloadUrl);
    for (const url of ['http://files.example.test/a', 'file:///cache/a', 'javascript:alert(1)', 'not a link', '']) {
      expect(() => signedLink(url)).toThrow('The link to the file cannot be used.');
    }
  });
});
