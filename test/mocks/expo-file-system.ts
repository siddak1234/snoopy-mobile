/**
 * expo-file-system (19.0.24, with expo-modules-core 3.0.30) as the app's file
 * actions use it (Round 21, the owner's Q7), for
 * `jest.mock('expo-file-system', () => require('@/test/mocks/expo-file-system'))`.
 * No device recording exists (the owner's TestFlight 31 check 3 is the device
 * proof); each shape is pinned to the module's own published types and its
 * iOS code instead, paths under node_modules/:
 *
 * - `Directory.pickDirectoryAsync()`: `Promise<Directory>`
 *   (expo-file-system/build/ExpoFileSystem.types.d.ts:134), the JS wrapping the
 *   native answer's `uri` (src/FileSystem.ts:209-212). iOS resolves a
 *   `FileSystemDirectory` of the picked URL (ios/FilePickingHandler.swift:73-77),
 *   stored as a directory (ios/FileSystemPath.swift:11-14), so its `uri`, the
 *   URL's `absoluteString` (ios/FileSystemModule.swift:350-352), ends in "/".
 * - The picker closed: `FilePickingCancelledException`
 *   (ios/FilePickingHandler.swift:80-83; ios/FileSystemExceptions.swift:94-96),
 *   also sent when the folder's access cannot start (ios/FilePickingUtils.swift:42-51,
 *   58-64). It reaches JS as expo-modules-core's `CodedError`
 *   (ios/JSI/EXJSIUtils.mm:115-126; src/errors/CodedError.ts:6-13) with
 *   `code` from the class name, "ERR_FILE_PICKING_CANCELLED"
 *   (ios/Core/Exceptions/CodedError.swift:45-54, Exception.swift:41-43), and
 *   `message` its reason (Exception.swift:51; ios/Core/Functions/AsyncFunctionDefinition.swift:163-164).
 * - `new File(folder, name)`: the module's own `Paths.join` (src/FileSystem.ts:82-84;
 *   src/pathUtilities/index.ts:15-23), used here as is: the name is URL-encoded.
 * - `File.exists`: `boolean` (build/ExpoFileSystem.types.d.ts:221-224); false
 *   for a folder, and false without read access (ios/FileSystemFile.swift:35-44).
 * - `File.copy(destination)`: `void` (build/ExpoFileSystem.types.d.ts:232-234);
 *   iOS copies with `FileManager.copyItem` (ios/FileSystemPath.swift:69-73),
 *   which refuses a name already taken or a folder that is not there; that
 *   Foundation error is thrown as `UnexpectedException`, code "ERR_UNEXPECTED"
 *   (expo-modules-core ios/Core/Functions/SyncFunctionDefinition.swift:138-139;
 *   ios/Core/Exceptions/UnexpectedException.swift). Its message is Apple's,
 *   not the module's, so it is not copied here.
 *
 * The picked address is the shape of an iCloud Drive folder.
 */
const { PathUtilities } = jest.requireActual('expo-file-system/src/pathUtilities');
const { CodedError } = jest.requireActual('expo-modules-core');

export const PICKED_FOLDER = 'file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Downloads/';

/** The JS error a closed folder picker rejects with, as iOS sends it. */
export function pickerClosedError(): Error {
  return new CodedError('ERR_FILE_PICKING_CANCELLED', 'File picking was cancelled by the user');
}

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

type Part = string | { uri: string };
const join = (parts: Part[]): string => PathUtilities.join(...parts);
const folders = () => new Set([PICKED_FOLDER, 'file:///cache/', 'file:///document/']);

export class Directory {
  uri: string;
  constructor(...parts: Part[]) {
    const uri = join(parts);
    this.uri = uri.endsWith('/') ? uri : `${uri}/`;
  }
  static pickDirectoryAsync = jest.fn(async () => new Directory(PICKED_FOLDER));
}

export class File {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return fileSystemState.taken.has(this.uri);
  }
  copy(target: { uri: string }) {
    const into = target.uri.slice(0, target.uri.lastIndexOf('/') + 1);
    if (fileSystemState.taken.has(target.uri) || !folders().has(into)) {
      throw new CodedError('ERR_UNEXPECTED', `Could not copy to ${target.uri}`);
    }
    fileSystemState.copies.push(`${this.uri} -> ${target.uri}`);
    fileSystemState.taken.add(target.uri);
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
