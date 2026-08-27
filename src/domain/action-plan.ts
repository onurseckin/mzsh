export type ReviewedAction = 'bootstrap' | 'update' | 'rollback';
export type RedactedTargetName =
  | 'managed-loader'
  | 'managed-private'
  | 'managed-shims'
  | 'managed-current'
  | 'adoption-receipt';

export interface ReviewedPlan {
  schema: 'mzsh.reviewed-plan/v1';
  id: string;
  action: ReviewedAction;
  targetNames: readonly RedactedTargetName[];
  fingerprint: string;
  state: 'reviewed';
  createdAt: string;
}

export interface ReviewedPlanMatch {
  id: string;
  action: ReviewedAction;
  fingerprint: string;
}

export interface CreateReviewedPlanInput {
  id: string;
  action: ReviewedAction;
  targetNames: readonly RedactedTargetName[];
  fingerprint: string;
  now: Date;
}

const reviewedPlanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprint = /^[0-9a-f]{64}$/i;

export function isReviewedPlanId(value: string): boolean {
  return reviewedPlanId.test(value);
}

export function createReviewedPlan(input: CreateReviewedPlanInput): ReviewedPlan {
  if (!isReviewedPlanId(input.id)) throw new Error('PLAN_ID_INVALID');
  if (!fingerprint.test(input.fingerprint)) throw new Error('PLAN_FINGERPRINT_INVALID');
  return {
    schema: 'mzsh.reviewed-plan/v1',
    id: input.id,
    action: input.action,
    targetNames: input.targetNames,
    fingerprint: input.fingerprint,
    state: 'reviewed',
    createdAt: input.now.toISOString(),
  };
}
