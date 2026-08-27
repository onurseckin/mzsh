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
  fingerprint: string;
  now: Date;
  snapshot(): RecoverySnapshot;
  execute(): Result;
}

export class ReviewedPlanApplicationService {
  constructor(
    private readonly plans: DurablePlanStore,
    private readonly history: ReviewedPlanHistory
  ) {}

  apply<Result>(input: ApplyReviewedPlanInput<Result>): Result {
    const plan = input.planId === undefined ? undefined : this.plans.consume(input.planId);
    if (
      plan === undefined ||
      input.confirmation !== 'APPLY' ||
      plan.action !== input.action ||
      plan.fingerprint !== input.fingerprint
    ) {
      throw new Error('PLAN_CONFIRMATION_REQUIRED');
    }
    const snapshot = input.snapshot();
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
