import type { ReviewedPlan, ReviewedPlanMatch } from '../domain/action-plan';
import type { DurablePlanStore } from '../domain/history';

export class InMemoryPlanStore implements DurablePlanStore {
  private readonly plans = new Map<string, ReviewedPlan>();

  save(plan: ReviewedPlan): void {
    this.plans.set(plan.id, plan);
  }

  find(id: string): ReviewedPlan | undefined {
    return this.plans.get(id);
  }

  consume(match: ReviewedPlanMatch): ReviewedPlan | undefined {
    const plan = this.plans.get(match.id);
    if (
      plan === undefined ||
      plan.action !== match.action ||
      plan.fingerprint !== match.fingerprint
    )
      return undefined;
    this.plans.delete(match.id);
    return plan;
  }
}
