import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createReviewedPlan } from '../../../src/domain/action-plan';
import type { HistoryRecord } from '../../../src/domain/history';
import { SqliteHistory } from '../../../src/infrastructure/history-sqlite';
import { ReviewedPlanApplicationService } from '../../../src/application/apply-reviewed-plan';

const fixtures: string[] = [];

function fixture(): string {
  const parent = join(import.meta.dir, '.fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'history-'));
  fixtures.push(root);
  return root;
}

function record(planId: string): HistoryRecord {
  return {
    id: '7f0b4527-2590-4c25-864d-57d484979f11',
    planId,
    action: 'bootstrap',
    targetNames: ['managed-loader'],
    planState: 'reviewed',
    result: 'pending',
    snapshot: {
      kind: 'managed-state',
      id: '7f0b4527-2590-4c25-864d-57d484979f11',
      capturedAt: '2026-08-27T00:00:00.000Z',
      targets: [{ name: 'managed-loader', state: 'file' }],
    },
    occurredAt: '2026-08-27T00:00:00.000Z',
  };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('SQLite history', () => {
  test('persists only typed redacted evidence in owner-only storage', () => {
    const directory = join(fixture(), 'state');
    const history = new SqliteHistory(directory);
    const plan = createReviewedPlan({
      id: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      action: 'bootstrap',
      targetNames: ['managed-loader'],
      fingerprint: 'a'.repeat(64),
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    const safeRecord = record(plan.id);
    Object.defineProperty(safeRecord, 'unpersistedEnvironmentValue', { value: 'not-recorded' });

    history.save(plan);
    history.record(safeRecord);
    history.complete(safeRecord.id, 'applied');
    history.close();

    const databasePath = join(directory, 'history.sqlite');
    expect(lstatSync(directory).mode & 0o777).toBe(0o700);
    expect(lstatSync(databasePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(databasePath, 'utf8')).not.toContain('not-recorded');
    const reopened = new SqliteHistory(directory);
    expect(reopened.find(plan.id)).toEqual(plan);
    expect(reopened.list(5)).toEqual([{ ...record(plan.id), result: 'applied' }]);
    reopened.close();
  });

  test('prunes records beyond the retention window during history operations', () => {
    const history = new SqliteHistory(join(fixture(), 'state'));
    const planId = '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49';
    const old = record(planId);
    old.occurredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

    history.record(old);

    expect(history.list(10)).toEqual([]);
    history.close();
  });

  test('persists a concrete snapshot before guarded execution and consumes the plan', () => {
    const history = new SqliteHistory(join(fixture(), 'state'));
    const plan = createReviewedPlan({
      id: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      action: 'bootstrap',
      targetNames: ['managed-loader'],
      fingerprint: 'a'.repeat(64),
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    const service = new ReviewedPlanApplicationService(history, history);
    const events: string[] = [];
    history.save(plan);

    const result = service.apply({
      planId: plan.id,
      confirmation: 'APPLY',
      action: 'bootstrap',
      fingerprint: plan.fingerprint,
      now: new Date('2026-08-27T00:00:00.000Z'),
      snapshot: () => {
        events.push('snapshot');
        return record(plan.id).snapshot;
      },
      execute: () => {
        events.push('execute');
        expect(history.list(10)[0]).toMatchObject({
          result: 'pending',
          snapshot: record(plan.id).snapshot,
        });
        return 'applied';
      },
    });

    expect(result).toBe('applied');
    expect(events).toEqual(['snapshot', 'execute']);
    expect(history.find(plan.id)).toBeUndefined();
    expect(history.list(10)[0]).toMatchObject({
      result: 'applied',
      snapshot: record(plan.id).snapshot,
    });
    let replayed = false;
    expect(() =>
      service.apply({
        planId: plan.id,
        confirmation: 'APPLY',
        action: 'bootstrap',
        fingerprint: plan.fingerprint,
        now: new Date('2026-08-27T00:00:00.000Z'),
        snapshot: () => record(plan.id).snapshot,
        execute: () => {
          replayed = true;
        },
      })
    ).toThrow('PLAN_CONFIRMATION_REQUIRED');
    expect(replayed).toBe(false);
    history.close();
  });

  test('marks only the failed attempt when guarded execution throws', () => {
    const history = new SqliteHistory(join(fixture(), 'state'));
    const plan = createReviewedPlan({
      id: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe50',
      action: 'update',
      targetNames: ['managed-current'],
      fingerprint: 'b'.repeat(64),
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    history.save(plan);
    const service = new ReviewedPlanApplicationService(history, history);

    expect(() =>
      service.apply({
        planId: plan.id,
        confirmation: 'APPLY',
        action: 'update',
        fingerprint: plan.fingerprint,
        now: new Date('2026-08-27T00:00:00.000Z'),
        snapshot: () => ({
          ...record(plan.id).snapshot,
          targets: [{ name: 'managed-current' as const, state: 'symlink' as const }],
        }),
        execute: () => {
          throw new Error('controlled failure');
        },
      })
    ).toThrow('controlled failure');
    expect(history.list(10)[0]).toMatchObject({ result: 'failed', planId: plan.id });
    history.close();
  });

  test('updates only the matching immutable history attempt', () => {
    const history = new SqliteHistory(join(fixture(), 'state'));
    const planId = '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49';
    const first = record(planId);
    const second = { ...record(planId), id: '24d76aa7-b719-4f3a-9d5f-cb8c8b9851a8' };

    history.record(first);
    history.record(second);
    history.complete(second.id, 'applied');

    const records = history.list(10);
    expect(records.find((entry) => entry.id === first.id)?.result).toBe('pending');
    expect(records.find((entry) => entry.id === second.id)?.result).toBe('applied');
    history.close();
  });
});
