import type { HistoryRecord, HistoryStore } from '../domain/history';

const retentionDays = 30;
const dayMilliseconds = 24 * 60 * 60 * 1000;

export class HistoryService {
  constructor(private readonly store: HistoryStore) {}

  listHistory(limit: number): readonly HistoryRecord[] {
    return this.store.list(limit);
  }

  pruneHistory(now: Date): readonly string[] {
    return this.store.prune(new Date(now.getTime() - retentionDays * dayMilliseconds));
  }
}
