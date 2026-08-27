import type { ReviewedPlan } from '../domain/action-plan';
import type { DurablePlanStore } from '../domain/history';

export class InMemoryPlanStore implements DurablePlanStore {
  private readonly plans = new Map<string, ReviewedPlan>();

  save(plan: ReviewedPlan): void {
    this.plans.set(plan.id, plan);
  }

  find(id: string): ReviewedPlan | undefined {
    return this.plans.get(id);
  }
}
