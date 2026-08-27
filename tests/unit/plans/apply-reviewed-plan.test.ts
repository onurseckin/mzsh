import { describe, expect, test } from 'bun:test';
import {
  ReviewedPlanApplicationService,
  type ReviewedPlanHistory,
} from '../../../src/application/apply-reviewed-plan';
import { InMemoryPlanStore } from '../../../src/application/plan-store';
import { createReviewedPlan } from '../../../src/domain/action-plan';
import type { HistoryRecord, RecoverySnapshot } from '../../../src/domain/history';

const now = new Date('2026-08-27T00:00:00.000Z');

function plan() {
  return createReviewedPlan({
    id: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
    action: 'bootstrap',
    targetNames: ['managed-loader'],
    fingerprint: 'a'.repeat(64),
    now,
  });
}

class RecordingHistory implements ReviewedPlanHistory {
  readonly events: string[] = [];
  readonly records: HistoryRecord[] = [];

  record(record: HistoryRecord): void {
    this.events.push('record');
    this.records.push(record);
  }

  complete(_planId: string, result: 'applied' | 'failed'): void {
    this.events.push(result);
  }
}

describe('reviewed plan application', () => {
  test('refuses destructive application without matching plan ID and confirmation', () => {
    const store = new InMemoryPlanStore();
    const reviewed = plan();
    store.save(reviewed);
    const service = new ReviewedPlanApplicationService(store, new RecordingHistory());

    expect(() =>
      service.apply({
        planId: reviewed.id,
        confirmation: 'apply',
        action: 'bootstrap',
        fingerprint: reviewed.fingerprint,
        now,
        snapshot: () => ({ kind: 'managed-state' }),
        execute: () => undefined,
      })
    ).toThrow('PLAN_CONFIRMATION_REQUIRED');
  });

  test('records the recovery snapshot before invoking the mutation', () => {
    const store = new InMemoryPlanStore();
    const reviewed = plan();
    store.save(reviewed);
    const history = new RecordingHistory();
    const service = new ReviewedPlanApplicationService(store, history);
    const events: string[] = [];
    const snapshot: RecoverySnapshot = { kind: 'managed-state' };

    const result = service.apply({
      planId: reviewed.id,
      confirmation: 'APPLY',
      action: 'bootstrap',
      fingerprint: reviewed.fingerprint,
      now,
      snapshot: () => {
        events.push('snapshot');
        return snapshot;
      },
      execute: () => {
        events.push('mutation');
        return 'applied';
      },
    });

    expect(result).toBe('applied');
    expect(events).toEqual(['snapshot', 'mutation']);
    expect(history.events).toEqual(['record', 'applied']);
    expect(history.records[0]).toMatchObject({
      planId: reviewed.id,
      action: 'bootstrap',
      result: 'pending',
      snapshot,
    });
  });
});
