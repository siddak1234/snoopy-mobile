import { Linking, Platform, Share } from 'react-native';

import { shareSignedFile, signedLink } from '@/lib/platform/signed-file';

jest.mock('@/lib/platform/client', () => ({
  downloadSignedFile: jest.fn(),
}));
const { downloadSignedFile } = jest.requireMock('@/lib/platform/client');

/**
 * The one way the app hands on a file behind a signed link (the round 24
 * review's eighth finding): Settings › Data's export and the run package's two
 * downloads both call `shareSignedFile` — the link checked, then iOS saves,
 * shares and removes it, Android opens it.
 */

const FILE = { downloadUrl: 'https://files.example.test/run.pdf?sig=1', filename: 'run-1.pdf' };
const os = Platform.OS;
let openURL: jest.SpyInstance;
let share: jest.SpyInstance;
let saved: { uri: string; exists: boolean; delete: jest.Mock };

beforeEach(() => {
  saved = { uri: 'file:///cache/run-1.pdf', exists: true, delete: jest.fn() };
  downloadSignedFile.mockReset().mockResolvedValue(saved);
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
});

afterEach(() => {
  Platform.OS = os;
  openURL.mockRestore();
  share.mockRestore();
});

describe('shareSignedFile', () => {
  it('on iOS saves the link into the cache under its name, hands the file to the share sheet, then removes it', async () => {
    Platform.OS = 'ios';
    await shareSignedFile(FILE);
    expect(downloadSignedFile).toHaveBeenCalledWith(FILE.downloadUrl, 'run-1.pdf');
    expect(share).toHaveBeenCalledWith({ url: 'file:///cache/run-1.pdf' });
    expect(saved.delete).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('on iOS removes the file even when the share sheet fails, and says the failure', async () => {
    Platform.OS = 'ios';
    share.mockRejectedValue(new Error('The share sheet closed.'));
    await expect(shareSignedFile(FILE)).rejects.toThrow('The share sheet closed.');
    expect(saved.delete).toHaveBeenCalledTimes(1);
  });

  it('on Android opens the link, saving nothing', async () => {
    Platform.OS = 'android';
    await shareSignedFile(FILE);
    expect(openURL).toHaveBeenCalledWith(FILE.downloadUrl);
    expect(downloadSignedFile).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)('on %s refuses a link that is not https: nothing opened, nothing saved', async (platform) => {
    Platform.OS = platform;
    await expect(shareSignedFile({ ...FILE, downloadUrl: 'http://files.example.test/run.pdf' })).rejects.toThrow('The link to the file cannot be used.');
    expect(openURL).not.toHaveBeenCalled();
    expect(downloadSignedFile).not.toHaveBeenCalled();
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
