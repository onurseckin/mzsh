import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { renderStableLoader } from '../application/render-stable-loader';
import type { BunLinker, ShellReconciler } from '../application/setup-service';
import { NodeAdoptionFilesystem } from './adoption-filesystem';

const loaderNames = ['.zshenv', '.zprofile', '.zshrc'] as const;
const managedMarker = '# mzsh-managed-loader\n';

interface LoaderPreflight {
  path: string;
  expected: string;
  current: string | undefined;
}

export interface BunLinkProcess {
  run(root: string): number;
}

class NativeBunLinkProcess implements BunLinkProcess {
  run(root: string): number {
    return spawnSync('bun', ['link'], { cwd: root, shell: false, stdio: 'ignore' }).status ?? 1;
  }
}

export class GlobalBunLink implements BunLinker {
  constructor(private readonly process: BunLinkProcess = new NativeBunLinkProcess()) {}

  link(root: string): string {
    if (this.process.run(root) !== 0) throw new Error('BUN_LINK_FAILED');
    return 'bun-link-created';
  }
}

export class ShellSetup implements ShellReconciler {
  constructor(
    private readonly home: string,
    private readonly filesystem: NodeAdoptionFilesystem = new NodeAdoptionFilesystem()
  ) {}

  reconcile(_root: string): string {
    if (!this.filesystem.hasSafeOwnedRoot(this.home)) throw new Error('SHELL_HOME_UNSAFE');
    const preflight = loaderNames.map((loader) => ({
      path: join(this.home, loader),
      expected: renderStableLoader(loader),
      current: this.current(join(this.home, loader)),
    }));
    const changes = preflight.filter((entry) => entry.current !== entry.expected);
    if (changes.length === 0) return 'shell-already-reconciled';
    const applied: LoaderPreflight[] = [];
    try {
      for (const entry of changes) {
        this.filesystem.writeAtomic(entry.path, entry.expected, 0o600);
        applied.push(entry);
      }
    } catch (error) {
      this.recover(applied);
      throw error;
    }
    return 'shell-reconciled';
  }

  private recover(entries: readonly LoaderPreflight[]): void {
    for (const entry of [...entries].reverse()) {
      if (entry.current === undefined) this.filesystem.remove(entry.path);
      else this.filesystem.writeAtomic(entry.path, entry.current, 0o600);
    }
  }

  private current(path: string): string | undefined {
    const state = this.filesystem.describe(path);
    if (state.kind === 'absent') return undefined;
    if (state.kind !== 'file') throw new Error('SHELL_LOADER_UNSAFE');
    const currentUser = this.filesystem.currentUserId();
    if (
      currentUser === undefined ||
      state.ownerId !== currentUser ||
      ((state.mode ?? 0) & 0o077) !== 0
    ) {
      throw new Error('SHELL_LOADER_UNSAFE');
    }
    const snapshot = this.filesystem.readRegularUtf8NoFollow(path);
    if (!snapshot.text.startsWith(managedMarker)) throw new Error('SHELL_LOADER_UNOWNED');
    return snapshot.text;
  }
}
