import { Linking, Platform, Share } from 'react-native';

import { saveSignedFile, saveToFiles, sharesFiles, shareSignedFile, signedLink } from '@/lib/platform/signed-file';

jest.mock('@/lib/platform/client', () => ({
  downloadSignedFile: jest.fn(),
}));
const { downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * The folder the person picks in Files, its closed picker's refusal, a file's
 * `exists` and `copy`: expo-file-system's own shapes, each cited where the
 * mock pins it (`test/mocks/expo-file-system.ts`).
 */
jest.mock('expo-file-system', () => require('@/test/mocks/expo-file-system'));
const { Directory, PICKED_FOLDER, fileSystemState, pickerClosedError } = jest.requireMock('expo-file-system');
const picked = { uri: PICKED_FOLDER as string };
const mockCopies: string[] = fileSystemState.copies;
const mockTaken: Set<string> = fileSystemState.taken;

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
  fileSystemState.reset();
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
    // The module's join URL-encodes the name: "run-1 2.pdf" is "run-1%202.pdf".
    mockTaken.add(`${picked.uri}run-1.pdf`);
    mockTaken.add(`${picked.uri}run-1%202.pdf`);
    await saveSignedFile(FILE);
    expect(mockCopies).toEqual([`file:///cache/run-1.pdf -> ${picked.uri}run-1%203.pdf`]);
  });

  it('on iOS the picker closed saves nothing, says nothing, and still removes the cache copy', async () => {
    Platform.OS = 'ios';
    Directory.pickDirectoryAsync.mockRejectedValue(pickerClosedError());
    await expect(saveSignedFile(FILE)).resolves.toBeUndefined();
    expect(mockCopies).toEqual([]);
    expect(saved.delete).toHaveBeenCalledTimes(1);
  });

  it('on iOS a copy Files refuses (the folder gone) is thrown to the screen, and the cache copy is removed', async () => {
    Platform.OS = 'ios';
    Directory.pickDirectoryAsync.mockResolvedValue(new Directory('file:///private/var/mobile/gone/'));
    await expect(saveSignedFile(FILE)).rejects.toMatchObject({ code: 'ERR_UNEXPECTED' });
    expect(mockCopies).toEqual([]);
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
    expect(mockCopies).toEqual([`file:///cache/notes -> ${picked.uri}notes%202`]);
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
