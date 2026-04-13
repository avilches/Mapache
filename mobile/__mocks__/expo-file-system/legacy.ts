/**
 * In-memory mock for expo-file-system/legacy used in Jest tests.
 *
 * Supports:
 *   _seedFile(path, content)  — pre-populate a file before a test
 *   _resetFs()                — clear all seeded / written files
 */

// Use a global so the mock state survives jest.resetModules() calls.
declare const global: any;
if (!global.__mockFs) {
  global.__mockFs = new Map<string, string>();
}
const fs: Map<string, string> = global.__mockFs;

export const documentDirectory = 'file:///mock-document/';

export const EncodingType = {
  Base64: 'base64',
  UTF8: 'utf8',
} as const;

export async function readAsStringAsync(path: string, _opts?: any): Promise<string> {
  if (!fs.has(path)) throw new Error(`File not found: ${path}`);
  return fs.get(path)!;
}

export async function writeAsStringAsync(path: string, content: string, _opts?: any): Promise<void> {
  fs.set(path, content);
}

export async function readDirectoryAsync(dir: string): Promise<string[]> {
  const prefix = dir.endsWith('/') ? dir : dir + '/';
  const entries = new Set<string>();
  for (const key of fs.keys()) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const first = rest.split('/')[0];
      if (first) entries.add(first);
    }
  }
  return Array.from(entries);
}

export async function makeDirectoryAsync(_path: string, _opts?: any): Promise<void> {
  // no-op in mock
}

export async function getInfoAsync(path: string): Promise<{ exists: boolean }> {
  return { exists: fs.has(path) };
}

export async function deleteAsync(path: string, _opts?: any): Promise<void> {
  const prefix = path.endsWith('/') ? path : path + '/';
  for (const key of Array.from(fs.keys())) {
    if (key === path || key.startsWith(prefix)) fs.delete(key);
  }
}

export const cacheDirectory = 'file:///mock-cache/';

// ─── Test helpers ─────────────────────────────────────────────────────────────

export function _seedFile(path: string, content: string): void {
  fs.set(path, content);
}

export function _resetFs(): void {
  fs.clear();
}

export function createDownloadResumable(
  _url: string,
  _fileUri: string,
  _options: any,
  _callback?: any
) {
  return {
    downloadAsync: async () => {},
  };
}
