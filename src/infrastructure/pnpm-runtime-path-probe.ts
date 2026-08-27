import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export type PnpmGlobalBinProbeResult =
  | { status: 'present'; directory: string }
  | { status: 'absent' | 'failed' };

type PathKind = 'file' | 'directory' | 'symlink' | 'other';

interface PathState {
  kind: PathKind;
  mode: number;
  ownerId: number;
}

function inspectPath(path: string): PathState | undefined {
  try {
    const stat = lstatSync(path);
    const mode = stat.mode & 0o777;
    if (stat.isFile()) return { kind: 'file', mode, ownerId: stat.uid };
    if (stat.isDirectory()) return { kind: 'directory', mode, ownerId: stat.uid };
    if (stat.isSymbolicLink()) return { kind: 'symlink', mode, ownerId: stat.uid };
    return { kind: 'other', mode, ownerId: stat.uid };
  } catch {
    return undefined;
  }
}

function resolvedPath(path: string): PathState | undefined {
  try {
    return inspectPath(realpathSync(path));
  } catch {
    return undefined;
  }
}

export function inspectPnpmRuntimeDirectory(
  xdgConfig: string,
  currentUserId: number | undefined
): PnpmGlobalBinProbeResult {
  const runtimeRoot = join(xdgConfig, 'mzsh', 'runtime-paths');
  const root = inspectPath(runtimeRoot);
  if (root === undefined) return { status: 'absent' };
  if (
    currentUserId === undefined ||
    root.kind !== 'directory' ||
    root.mode !== 0o700 ||
    root.ownerId !== currentUserId
  ) {
    return { status: 'failed' };
  }

  const entry = join(runtimeRoot, 'pnpm');
  const entryState = inspectPath(entry);
  if (entryState === undefined) return { status: 'absent' };
  if (entryState.kind !== 'symlink' || resolvedPath(entry)?.kind !== 'directory') {
    return { status: 'failed' };
  }

  return { status: 'present', directory: entry };
}
