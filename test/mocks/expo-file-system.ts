/**
 * expo-file-system as the app's file actions use it (Round 21, the owner's
 * Q7), for `jest.mock('expo-file-system', () => require('@/test/mocks/expo-file-system'))`:
 * the folder the person picks in Files answered as the module answers it — a
 * `Directory` of the picked folder's address (its src/FileSystem.ts:209-212,
 * `new Directory((await ExpoFileSystem.pickDirectoryAsync(initialUri)).uri)`);
 * a closed picker's refusal is its iOS `FilePickingCancelledException`
 * (ios/FileSystemExceptions.swift:94-96, "File picking was cancelled by the
 * user"). A `File` is its address joined from its parts; `copy` records where
 * it went, and `exists` is what a test says the folder holds already. The
 * picked address is the shape of an iCloud Drive folder; no device recording
 * of it exists yet (a finding in the round's summary).
 */
export const PICKED_FOLDER = 'file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Downloads/';

export const fileSystemState = {
  copies: [] as string[],
  taken: new Set<string>(),
  written: [] as string[],
  reset() {
    this.copies.length = 0;
    this.taken.clear();
    this.written.length = 0;
  },
};

const uriOf = (part: string | { uri: string }) => (typeof part === 'string' ? part : part.uri);

export class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map(uriOf).join('');
  }
  static pickDirectoryAsync = jest.fn(async () => new Directory(PICKED_FOLDER));
}

export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map(uriOf).join(parts.length > 1 && !uriOf(parts[0]!).endsWith('/') ? '/' : '');
  }
  get exists() {
    return fileSystemState.taken.has(this.uri);
  }
  copy(target: { uri: string }) {
    fileSystemState.copies.push(`${this.uri} -> ${target.uri}`);
  }
  create() {
    fileSystemState.taken.add(this.uri);
  }
  write(text: string) {
    fileSystemState.written.push(text);
  }
  delete() {
    fileSystemState.taken.delete(this.uri);
  }
}

export const Paths = { cache: new Directory('file:///cache/'), document: new Directory('file:///document/') };
