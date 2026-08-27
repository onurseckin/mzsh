import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { AdoptionTargetState } from '../domain/adoption';

export interface RegularFileSnapshot {
  bytes: Uint8Array;
  text: string;
  state: AdoptionTargetState;
}

interface TemporaryIdentity {
  dev: number;
  ino: number;
}

type TemporaryKind = 'file' | 'symlink';

export class NodeAdoptionFilesystem {
  constructor(
    private readonly temporaryName: () => string = () => randomBytes(16).toString('hex'),
    private readonly afterRename?: () => void,
    private readonly afterCreate?: (temporary: string, kind: TemporaryKind) => void
  ) {}
  describe(path: string): AdoptionTargetState {
    try {
      const stat = lstatSync(path);
      const mode = stat.mode & 0o777;
      if (stat.isFile())
        return { path, kind: 'file', mode, ownerId: stat.uid, hash: this.hash(path) };
      if (stat.isSymbolicLink())
        return { path, kind: 'symlink', mode, ownerId: stat.uid, linkTarget: readlinkSync(path) };
      if (stat.isDirectory()) return { path, kind: 'directory', mode, ownerId: stat.uid };
      return { path, kind: 'other', mode, ownerId: stat.uid };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return { path, kind: 'absent' };
      }
      throw error;
    }
  }

  read(path: string): string {
    return readFileSync(path, 'utf8');
  }

  readBytes(path: string): Uint8Array {
    return readFileSync(path);
  }

  readRegularUtf8NoFollow(path: string): RegularFileSnapshot {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) throw new Error('not a regular file');
      const bytes = readFileSync(descriptor);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return {
        bytes,
        text,
        state: {
          path,
          kind: 'file',
          mode: stat.mode & 0o777,
          ownerId: stat.uid,
          hash: createHash('sha256').update(bytes).digest('hex'),
        },
      };
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }

  hash(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  ensureDirectory(path: string, mode = 0o700, enforceMode = false): void {
    try {
      mkdirSync(path, { recursive: false, mode });
      chmodSync(path, mode);
    } catch (error) {
      if (this.describe(path).kind !== 'directory') throw error;
      if (enforceMode) chmodSync(path, mode);
    }
  }

  writeAtomic(path: string, content: string | Uint8Array, mode = 0o600): void {
    if (!this.hasSafeAtomicParent(path)) throw new Error('unsafe atomic parent');
    const temporary = join(dirname(path), `.${basename(path)}.${this.temporaryName()}.mzsh-tmp`);
    let descriptor: number | undefined;
    let created = false;
    let renamed = false;
    let identity: TemporaryIdentity | undefined;
    try {
      descriptor = openSync(temporary, 'wx', mode);
      created = true;
      identity = this.temporaryIdentity(temporary);
      this.afterCreate?.(temporary, 'file');
      if (typeof content === 'string') {
        writeSync(descriptor, content);
      } else {
        writeSync(descriptor, content);
      }
      closeSync(descriptor);
      descriptor = undefined;
      chmodSync(temporary, mode);
      renameSync(temporary, path);
      renamed = true;
      chmodSync(path, mode);
      this.afterRename?.();
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          // Preserve the primary atomic-write failure.
        }
      }
      if (created && !renamed) {
        this.removeOnlyMatchingTemporary(temporary, identity);
      }
      throw error;
    }
  }

  linkAtomic(path: string, target: string): void {
    if (!this.hasSafeAtomicParent(path)) throw new Error('unsafe atomic parent');
    const temporary = join(dirname(path), `.${basename(path)}.${this.temporaryName()}.mzsh-tmp`);
    let created = false;
    let renamed = false;
    let identity: TemporaryIdentity | undefined;
    try {
      symlinkSync(target, temporary);
      created = true;
      identity = this.temporaryIdentity(temporary);
      this.afterCreate?.(temporary, 'symlink');
      renameSync(temporary, path);
      renamed = true;
      this.afterRename?.();
    } catch (error) {
      if (created && !renamed) {
        this.removeOnlyMatchingTemporary(temporary, identity);
      }
      throw error;
    }
  }

  remove(path: string): void {
    rmSync(path, { force: true, recursive: false });
  }

  backup(state: AdoptionTargetState, backupPath: string): void {
    if (state.kind !== 'file') return;
    this.writeAtomic(backupPath, this.readBytes(state.path), 0o600);
  }

  restore(state: AdoptionTargetState, backupPath?: string): void {
    if (state.kind === 'absent') {
      this.remove(state.path);
      return;
    }
    if (state.kind === 'file' && backupPath !== undefined) {
      this.writeAtomic(state.path, this.readBytes(backupPath), state.mode ?? 0o600);
      return;
    }
    if (state.kind === 'symlink' && state.linkTarget !== undefined) {
      this.linkAtomic(state.path, state.linkTarget);
    }
  }

  isAbsolute(path: string): boolean {
    return isAbsolute(path);
  }

  currentUserId(): number | undefined {
    return typeof process.getuid === 'function' ? process.getuid() : undefined;
  }

  hasSafeOwnedRoot(path: string): boolean {
    if (!isAbsolute(path)) return false;
    const state = this.describe(path);
    const userId = this.currentUserId();
    if (
      state.kind !== 'directory' ||
      state.ownerId === undefined ||
      userId === undefined ||
      state.ownerId !== userId
    )
      return false;
    if (((state.mode ?? 0) & 0o022) !== 0) return false;
    return realpathSync(path) === resolve(path);
  }

  hasSafeAtomicParent(path: string): boolean {
    return this.hasSafeOwnedRoot(dirname(path));
  }

  isContainedWithoutEscape(root: string, target: string): boolean {
    if (!isAbsolute(root) || !isAbsolute(target)) return false;
    if (!this.hasSafeOwnedRoot(root)) return false;
    const normalizedRoot = resolve(root);
    const normalizedTarget = resolve(target);
    const relativeTarget = relative(normalizedRoot, normalizedTarget);
    if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) return false;
    let current = normalizedRoot;
    for (const component of relativeTarget.split('/').filter(Boolean)) {
      current = join(current, component);
      const state = this.describe(current);
      if (state.kind !== 'symlink') continue;
      try {
        const resolved = realpathSync(current);
        const escaped = relative(normalizedRoot, resolved);
        if (escaped.startsWith('..') || isAbsolute(escaped)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  private temporaryIdentity(path: string): TemporaryIdentity {
    const stat = lstatSync(path);
    return { dev: Number(stat.dev), ino: Number(stat.ino) };
  }

  private removeOnlyMatchingTemporary(path: string, identity: TemporaryIdentity | undefined): void {
    if (identity === undefined) return;
    try {
      const current = this.temporaryIdentity(path);
      if (current.dev !== identity.dev || current.ino !== identity.ino) return;
      unlinkSync(path);
    } catch {
      // A concurrent removal or replacement is intentionally left untouched.
    }
  }
}
