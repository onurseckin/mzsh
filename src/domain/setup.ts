export type RepositorySafetyCode =
  | 'REPOSITORY_DIRTY'
  | 'REPOSITORY_DIVERGED'
  | 'REPOSITORY_UNPUSHED'
  | 'REPOSITORY_UNAVAILABLE';

export type RepositorySafety =
  | { kind: 'safe'; behind: number }
  | { kind: 'blocked'; code: RepositorySafetyCode };

export type SetupOperation =
  | { kind: 'clone'; source: string; target: string }
  | { kind: 'fast-forward'; root: string }
  | { kind: 'bun-link'; root: string }
  | { kind: 'shell-reconcile'; root: string };

export interface SetupPlan {
  schema: 'mzsh.setup-plan/v1';
  target: string;
  operations: readonly SetupOperation[];
}

export type SetupPlanResult =
  | { kind: 'ready'; plan: SetupPlan }
  | { kind: 'blocked'; code: RepositorySafetyCode | 'REPOSITORY_INVALID' };

export type UpdateResult =
  | { kind: 'ready'; root: string; operations: readonly SetupOperation[] }
  | { kind: 'blocked'; code: RepositorySafetyCode | 'REPOSITORY_INVALID' }
  | { kind: 'applied'; root: string; evidence: readonly string[] };
