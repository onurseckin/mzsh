import type { RepositorySafety } from '../domain/setup';

export interface RepositorySafetyGit {
  statusPorcelain(root: string): { status: number; output: string };
  aheadBehind(root: string): { status: number; output: string };
}

function relation(value: string): { behind: number; ahead: number } | undefined {
  const match = /^(\d+)\s+(\d+)\s*$/.exec(value);
  if (match === null) return undefined;
  const behind = Number(match[1]);
  const ahead = Number(match[2]);
  if (!Number.isSafeInteger(behind) || !Number.isSafeInteger(ahead)) return undefined;
  return { behind, ahead };
}

export function inspectRepositorySafety(root: string, git: RepositorySafetyGit): RepositorySafety {
  const status = git.statusPorcelain(root);
  if (status.status !== 0) return { kind: 'blocked', code: 'REPOSITORY_UNAVAILABLE' };
  if (status.output.trim().length > 0) return { kind: 'blocked', code: 'REPOSITORY_DIRTY' };
  const relationOutput = git.aheadBehind(root);
  const parsed = relationOutput.status === 0 ? relation(relationOutput.output) : undefined;
  if (parsed === undefined) return { kind: 'blocked', code: 'REPOSITORY_UNAVAILABLE' };
  if (parsed.ahead > 0 && parsed.behind > 0)
    return { kind: 'blocked', code: 'REPOSITORY_DIVERGED' };
  if (parsed.ahead > 0) return { kind: 'blocked', code: 'REPOSITORY_UNPUSHED' };
  return { kind: 'safe', behind: parsed.behind };
}
