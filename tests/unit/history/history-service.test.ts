import { describe, expect, test } from 'bun:test';
import { HistoryService } from '../../../src/application/history-service';
import type { HistoryRecord, HistoryStore } from '../../../src/domain/history';

const day = 24 * 60 * 60 * 1000;

class MemoryHistoryStore implements HistoryStore {
  constructor(private records: HistoryRecord[]) {}

  record(record: HistoryRecord): void {
    this.records.push(record);
  }

  complete(planId: string, result: 'applied' | 'failed'): void {
    this.records = this.records.map((record) =>
      record.planId === planId ? { ...record, result } : record
    );
  }

  list(limit: number): readonly HistoryRecord[] {
    return this.records.slice(0, limit);
  }

  prune(before: Date): readonly string[] {
    const removed = this.records
      .filter((record) => new Date(record.occurredAt).getTime() < before.getTime())
      .map((record) => record.id);
    this.records = this.records.filter(
      (record) => new Date(record.occurredAt).getTime() >= before.getTime()
    );
    return removed;
  }
}

function record(id: string, occurredAt: Date): HistoryRecord {
  return {
    id,
    planId: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
    action: 'rollback',
    targetNames: ['managed-loader'],
    planState: 'reviewed',
    result: 'applied',
    snapshot: { kind: 'adoption-receipt' },
    occurredAt: occurredAt.toISOString(),
  };
}

describe('history service', () => {
  test('prunes only records older than thirty days', () => {
    const now = new Date('2026-08-27T00:00:00.000Z');
    const store = new MemoryHistoryStore([
      record('old-record', new Date(now.getTime() - 31 * day)),
      record('boundary-record', new Date(now.getTime() - 30 * day)),
      record('recent-record', new Date(now.getTime() - day)),
    ]);
    const service = new HistoryService(store);

    expect(service.pruneHistory(now)).toEqual(['old-record']);
    expect(service.listHistory(10).map((entry) => entry.id)).toEqual([
      'boundary-record',
      'recent-record',
    ]);
  });
});
