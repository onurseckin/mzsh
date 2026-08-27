import type { RedactedTargetName, ReviewedAction, ReviewedPlan } from './action-plan';

export type RecoverySnapshot = { kind: 'managed-state' | 'adoption-receipt' };
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
  complete(planId: string, result: Exclude<HistoryResult, 'pending'>): void;
  list(limit: number): readonly HistoryRecord[];
  prune(before: Date): readonly string[];
}

export interface DurablePlanStore {
  save(plan: ReviewedPlan): void;
  find(id: string): ReviewedPlan | undefined;
}
