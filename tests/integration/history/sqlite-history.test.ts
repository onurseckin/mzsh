import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createReviewedPlan } from '../../../src/domain/action-plan';
import type { HistoryRecord } from '../../../src/domain/history';
import { SqliteHistory } from '../../../src/infrastructure/history-sqlite';

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
    snapshot: { kind: 'managed-state' },
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
    history.complete(plan.id, 'applied');
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
});
