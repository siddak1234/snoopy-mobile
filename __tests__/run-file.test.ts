jest.mock('@/lib/platform/client', () => ({ platformOperation: jest.fn(), putFileToSignedUrl: jest.fn() }));

import { FILE_CHANGED, FILE_EMPTY, sendRunFile, type ChosenFile } from '@/lib/platform/run-file';

const { platformOperation, putFileToSignedUrl } = jest.requireMock('@/lib/platform/client');
const automationsPost = jest.fn();
const signal = new AbortController().signal;

const TICKET = {
  uploadSessionId: 'upload-1',
  uploadUrl: 'https://store.example.test/put?signature=abc',
  expiresAt: '2026-09-29T12:00:00Z',
  maximumSizeBytes: 1_000_000,
};
const ARTIFACT = { artifactId: 'artifact-1', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 5 };

function chosen(bytes: Uint8Array<ArrayBuffer>, overrides: Partial<ChosenFile> = {}): ChosenFile {
  return { name: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: bytes.byteLength, read: jest.fn(async () => bytes), ...overrides };
}

beforeEach(() => {
  platformOperation.mockReset();
  automationsPost.mockReset();
  putFileToSignedUrl.mockReset().mockResolvedValue(undefined);
  platformOperation.mockImplementation(async (_key: string, execute: Function) => {
    const result = await execute({ automations: { POST: automationsPost } }, signal);
    return result.data ?? null;
  });
  automationsPost.mockImplementation(async (path: string) =>
    path.endsWith('/complete') ? { data: { artifact: ARTIFACT } } : { data: TICKET },
  );
});

describe('a file for a run (FR-14, 24.4.1)', () => {
  it('opens the upload for the exact size, PUTs exactly those bytes to the signed URL, then completes it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(sendRunFile('ws-1', 'sub-1', chosen(bytes), signal)).resolves.toEqual(ARTIFACT);

    expect(automationsPost).toHaveBeenNthCalledWith(1, '/v1/workspaces/{workspaceId}/uploads', {
      params: { path: { workspaceId: 'ws-1' } },
      body: { subscriptionId: 'sub-1', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 5 },
      signal,
    });
    expect(putFileToSignedUrl).toHaveBeenCalledWith(TICKET.uploadUrl, bytes, 'application/pdf', signal);
    expect(automationsPost).toHaveBeenNthCalledWith(2, '/v1/workspaces/{workspaceId}/uploads/{uploadSessionId}/complete', {
      params: { path: { workspaceId: 'ws-1', uploadSessionId: 'upload-1' } },
      body: {},
      signal,
    });
  });

  it('sends nothing when the bytes read are not the size the platform signed', async () => {
    // Measured at 5 on disk, 4 when read: the store would refuse the length,
    // so the bytes are not sent and the upload is not completed.
    const file = chosen(new Uint8Array([1, 2, 3, 4]), { sizeBytes: 5 });
    await expect(sendRunFile('ws-1', 'sub-1', file, signal)).rejects.toThrow(FILE_CHANGED);
    expect(putFileToSignedUrl).not.toHaveBeenCalled();
    expect(automationsPost).toHaveBeenCalledTimes(1);
  });

  it('asks before reading: a refused open never loads the file', async () => {
    automationsPost.mockRejectedValueOnce(new Error('The file is larger than this automation accepts.'));
    const file = chosen(new Uint8Array([1, 2, 3]));
    await expect(sendRunFile('ws-1', 'sub-1', file, signal)).rejects.toThrow('larger');
    expect(file.read).not.toHaveBeenCalled();
    expect(putFileToSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses an empty file without asking the platform', async () => {
    await expect(sendRunFile('ws-1', 'sub-1', chosen(new Uint8Array([])), signal)).rejects.toThrow(FILE_EMPTY);
    expect(automationsPost).not.toHaveBeenCalled();
  });

  it('names a file the picker could not type as application/octet-stream, and sends it as that', async () => {
    await sendRunFile('ws-1', 'sub-1', chosen(new Uint8Array([7]), { mimeType: undefined }), signal);
    expect(automationsPost.mock.calls[0][1].body.contentType).toBe('application/octet-stream');
    expect(putFileToSignedUrl.mock.calls[0][2]).toBe('application/octet-stream');
  });
});
