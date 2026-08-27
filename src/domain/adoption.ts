export type AdoptionTargetKind = 'absent' | 'file' | 'symlink' | 'directory' | 'other';
export type AdoptionMutationCategory = 'loader' | 'private' | 'legacy' | 'shims' | 'current';

export interface AdoptionTargetState {
  path: string;
  kind: AdoptionTargetKind;
  mode?: number;
  ownerId?: number;
  hash?: string;
  linkTarget?: string;
}

export interface AdoptionTarget {
  category: AdoptionMutationCategory;
  path: string;
  before: AdoptionTargetState;
}

export interface AdoptionMutation {
  category: AdoptionMutationCategory;
  path: string;
  kind: 'file' | 'symlink';
  linkTarget?: string;
}

export interface AdoptionPlan {
  schema: 'mzsh.adoption-plan/v1';
  id: string;
  home: string;
  repository: string;
  config: string;
  stateDirectory: string;
  backupDirectory: string;
  privatePath: string;
  currentLink: string;
  shimLink: string;
  entrypoint: string;
  repositoryPreconditions: { entrypointHash: string; packageHash: string };
  moduleOrder: readonly string[];
  targets: readonly AdoptionTarget[];
  mutations: readonly AdoptionMutation[];
  repositoryMetadata: { version: string; commit: string | null };
  privateMigration?: {
    sourcePath: string;
    sourceHash: string;
    selectedLineIndexes: readonly number[];
  };
}

export interface AdoptionReceiptTarget {
  category: AdoptionMutationCategory;
  original: AdoptionTargetState;
  applied: AdoptionTargetState;
  backupRelativePath?: string;
}

export interface AdoptionReceipt {
  schema: 'mzsh.adoption-receipt/v1';
  status: 'applied' | 'unavailable';
  id: string;
  home: string;
  config: string;
  stateDirectory: string;
  repository: { root: string; version: string; commit: string | null };
  moduleOrder: readonly string[];
  pathOrder: readonly AdoptionMutationCategory[];
  preflight: { kind: 'passed' };
  targets: readonly AdoptionReceiptTarget[];
}

export type AdoptionPlanResult =
  | { kind: 'ready'; plan: AdoptionPlan }
  | { kind: 'rejected'; code: string; path: string };
export type AdoptionApplyResult =
  | { kind: 'applied'; receiptPath: string }
  | { kind: 'failed'; stage: 'preflight' | 'apply'; code: string; path: string };
export type AdoptionRollbackResult =
  | { kind: 'ready'; dryRun: true; paths: readonly string[] }
  | { kind: 'rolled-back'; paths: readonly string[] }
  | { kind: 'conflict'; paths: readonly string[] }
  | { kind: 'failed'; code: string; path: string };
