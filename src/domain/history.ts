import {
  isReviewedPlanId,
  type RedactedTargetName,
  type ReviewedAction,
  type ReviewedPlan,
  type ReviewedPlanMatch,
} from './action-plan';

export type RecoveryTargetState = 'absent' | 'file' | 'symlink' | 'directory' | 'other';

export interface RecoverySnapshotTarget {
  name: RedactedTargetName;
  state: RecoveryTargetState;
}

export interface RecoverySnapshot {
  id: string;
  kind: 'managed-state' | 'adoption-receipt';
  capturedAt: string;
  targets: readonly RecoverySnapshotTarget[];
}

export interface CreateRecoverySnapshotInput {
  id: string;
  kind: RecoverySnapshot['kind'];
  capturedAt: Date;
  targets: readonly RecoverySnapshotTarget[];
}

export function createRecoverySnapshot(input: CreateRecoverySnapshotInput): RecoverySnapshot {
  if (!isReviewedPlanId(input.id) || input.targets.length === 0)
    throw new Error('REDACTED_SNAPSHOT_REQUIRED');
  return {
    id: input.id,
    kind: input.kind,
    capturedAt: input.capturedAt.toISOString(),
    targets: input.targets,
  };
}
export type HistoryResult = 'pending' | 'applied' | 'failed';

export interface HistoryRecord {
  id: string;
  planId: string;
  action: ReviewedAction;
  targetNames: readonly RedactedTargetName[];
  planState: 'reviewed';
  result: HistoryResult;
  snapshot: RecoverySnapshot;
  occurredAt: string;
}

export interface HistoryStore {
  record(record: HistoryRecord): void;
  complete(attemptId: string, result: Exclude<HistoryResult, 'pending'>): void;
  list(limit: number): readonly HistoryRecord[];
  prune(before: Date): readonly string[];
}

export interface DurablePlanStore {
  save(plan: ReviewedPlan): void;
  find(id: string): ReviewedPlan | undefined;
  consume(match: ReviewedPlanMatch): ReviewedPlan | undefined;
}
