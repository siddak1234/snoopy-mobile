/**
 * expo-file-system (57.0.7, with expo-modules-core 57.0.24 and expo-modules-jsi
 * 57.1.3) as the app's file actions use it (Round 21, the owner's Q7), for
 * `jest.mock('expo-file-system', () => require('@/test/mocks/expo-file-system'))`.
 * No device recording exists (the owner's TestFlight 31 check 3 is the device
 * proof); each shape is pinned to the module's own published types and its
 * iOS code instead, paths under node_modules/:
 *
 * - `Directory.pickDirectoryAsync()`: `Promise<Directory>`
 *   (expo-file-system/build/Directory.d.ts:16), the JS wrapping the native
 *   answer's `uri` (src/Directory.ts:106-109). iOS resolves a
 *   `FileSystemDirectory` of the picked URL (ios/FilePickingHandler.swift:84-89),
 *   stored as a directory (ios/FileSystemPath.swift:11-14), so its `uri`, the
 *   URL's `absoluteString` (ios/FileSystemModule.swift:343-345), ends in "/".
 * - The picker closed: `FilePickingCancelledException`
 *   (ios/FilePickingHandler.swift:91-95; ios/FileSystemExceptions.swift:100-103),
 *   also sent when the folder's access cannot start (ios/FilePickingUtils.swift:42-54,
 *   62-68). Since 56 it reaches JS through expo-modules-jsi, in place of
 *   expo-modules-core's ios/JSI/EXJSIUtils.mm: an `Error` with `code`
 *   (apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift:208,
 *   JavaScriptError.swift:58-63 and 42-51), here expo-modules-core's `CodedError`
 *   (src/errors/CodedError.ts:6-13), its `code` from the class name,
 *   "ERR_FILE_PICKING_CANCELLED" (ios/Core/Exceptions/CodedError.swift:45-55,
 *   Exception.swift:48-50). Its `message` is the exception's `String(reflecting:)`
 *   (expo-modules-jsi Protocols/JavaScriptThrowable.swift:28-31): its name, its
 *   reason and the Swift file and line (Exception.swift:62-65); here the reason alone.
 * - `new File(folder, name)`: the module's own `Paths.join` (src/File.ts:150; src/Paths.ts:6;
 *   src/pathUtilities/index.ts:15-23), used here as is: the name is URL-encoded.
 * - `File.exists`: `boolean` (build/internal/NativeFileSystem.types.d.ts:168-172);
 *   false for a folder, and false without read access (ios/FileSystemFile.swift:35-44).
 * - `File.copy(destination)`: since 56 `Promise<void>`
 *   (build/internal/NativeFileSystem.types.d.ts:182; iOS `AsyncFunction("copy")`,
 *   ios/FileSystemModule.swift:230-232; `copySync` is the old one); iOS copies
 *   with `FileManager.copyItem` (ios/FileSystemPath.swift:69-79), which refuses a
 *   name already taken or a folder that is not there; that Foundation error
 *   rejects the promise as `UnexpectedException`, code "ERR_UNEXPECTED"
 *   (expo-modules-core ios/Core/Functions/AsyncFunctionDefinition.swift:125-127;
 *   ios/Core/Exceptions/UnexpectedException.swift). Its message is Apple's, not
 *   the module's, so it is not copied here. The copy settles after the call
 *   returns, as the native copy does.
 * - `File.write(content)`: still `void` at 57.0.7
 *   (build/internal/NativeFileSystem.types.d.ts:155; iOS `Function("write")`,
 *   ios/FileSystemModule.swift:177).
 *
 * The picked address is the shape of an iCloud Drive folder.
 */
import { dirname, join as joinPath } from 'node:path';

// Since 55 the package exports ".", "./legacy", "./package.json" and the plugin
// (its package.json "exports"; 57.0.7's too), not src/, so its own path helpers
// are read from its folder.
const { PathUtilities } = jest.requireActual(
  joinPath(dirname(require.resolve('expo-file-system/package.json')), 'src/pathUtilities'),
);
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
  async copy(target: { uri: string }) {
    const into = target.uri.slice(0, target.uri.lastIndexOf('/') + 1);
    await null;
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
