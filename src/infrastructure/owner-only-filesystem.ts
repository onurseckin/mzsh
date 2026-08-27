import { chmodSync, lstatSync, mkdirSync } from 'node:fs';

export class OwnerOnlyFilesystem {
  ensureDirectory(path: string): void {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
    const state = lstatSync(path);
    if (
      !state.isDirectory() ||
      state.uid !== process.getuid?.() ||
      (state.mode & 0o777) !== 0o700
    ) {
      throw new Error('OWNER_ONLY_DIRECTORY_REQUIRED');
    }
  }

  ensureFile(path: string): void {
    chmodSync(path, 0o600);
    const state = lstatSync(path);
    if (!state.isFile() || state.uid !== process.getuid?.() || (state.mode & 0o777) !== 0o600) {
      throw new Error('OWNER_ONLY_FILE_REQUIRED');
    }
  }
}
