import { randomUUID } from 'node:crypto';
import type { ReviewedAction } from '../domain/action-plan';
import type { HistoryRecord, RecoverySnapshot } from '../domain/history';
import type { DurablePlanStore } from '../domain/history';

export interface ReviewedPlanHistory {
  record(record: HistoryRecord): void;
  complete(planId: string, result: 'applied' | 'failed'): void;
}

export interface ApplyReviewedPlanInput<Result> {
  planId?: string;
  confirmation?: string;
  action: ReviewedAction;
  fingerprint?: string;
  now: Date;
  snapshot(): RecoverySnapshot;
  revalidate?(): boolean;
  execute(): Result;
}

export class ReviewedPlanApplicationService {
  constructor(
    private readonly plans: DurablePlanStore,
    private readonly history: ReviewedPlanHistory
  ) {}

  apply<Result>(input: ApplyReviewedPlanInput<Result>): Result {
    if (
      input.planId === undefined ||
      input.confirmation !== 'APPLY' ||
      input.fingerprint === undefined
    )
      throw new Error('PLAN_CONFIRMATION_REQUIRED');
    const reviewed = this.plans.find(input.planId);
    if (
      reviewed === undefined ||
      reviewed.action !== input.action ||
      reviewed.fingerprint !== input.fingerprint
    )
      throw new Error('PLAN_CONFIRMATION_REQUIRED');
    const snapshot = input.snapshot();
    if (input.revalidate !== undefined && !input.revalidate())
      throw new Error('PLAN_CONFIRMATION_REQUIRED');
    const plan = this.plans.consume({
      id: input.planId,
      action: input.action,
      fingerprint: input.fingerprint,
    });
    if (plan === undefined) throw new Error('PLAN_CONFIRMATION_REQUIRED');
    const attemptId = randomUUID();
    this.history.record({
      id: attemptId,
      planId: plan.id,
      action: plan.action,
      targetNames: plan.targetNames,
      planState: plan.state,
      result: 'pending',
      snapshot,
      occurredAt: input.now.toISOString(),
    });
    try {
      const result = input.execute();
      this.history.complete(attemptId, 'applied');
      return result;
    } catch (error) {
      this.history.complete(attemptId, 'failed');
      throw error;
    }
  }
}
