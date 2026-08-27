import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isReviewedPlanId, type ReviewedPlan, type ReviewedPlanMatch } from '../domain/action-plan';
import type {
  DurablePlanStore,
  HistoryRecord,
  HistoryStore,
  RecoverySnapshot,
} from '../domain/history';
import { OwnerOnlyFilesystem } from './owner-only-filesystem';

interface PlanRow {
  id: string;
  action: ReviewedPlan['action'];
  target_names: string;
  fingerprint: string;
  created_at: string;
}

interface HistoryRow {
  id: string;
  plan_id: string;
  action: HistoryRecord['action'];
  target_names: string;
  result: HistoryRecord['result'];
  snapshot_kind: HistoryRecord['snapshot']['kind'];
  snapshot_json: string;
  occurred_at: string;
}

export class SqliteHistory implements DurablePlanStore, HistoryStore {
  private readonly databasePath: string;
  private readonly database: Database;

  constructor(directory: string, filesystem = new OwnerOnlyFilesystem()) {
    filesystem.ensureDirectory(directory);
    this.databasePath = join(directory, 'history.sqlite');
    this.database = new Database(this.databasePath, { create: true, strict: true });
    filesystem.ensureFile(this.databasePath);
    this.database.run(
      'CREATE TABLE IF NOT EXISTS reviewed_plans (id TEXT PRIMARY KEY, action TEXT NOT NULL, target_names TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL)'
    );
    this.database.run(
      'CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, action TEXT NOT NULL, target_names TEXT NOT NULL, result TEXT NOT NULL, snapshot_kind TEXT NOT NULL, snapshot_json TEXT NOT NULL, occurred_at TEXT NOT NULL)'
    );
    const columns = this.database.query<{ name: string }, []>('PRAGMA table_info(history)').all();
    if (!columns.some((column) => column.name === 'snapshot_json')) {
      this.database.run("ALTER TABLE history ADD COLUMN snapshot_json TEXT NOT NULL DEFAULT '{}'");
    }
  }

  save(plan: ReviewedPlan): void {
    if (!isReviewedPlan(plan)) throw new Error('REDACTED_PLAN_REQUIRED');
    this.database
      .query<never, [string, string, string, string, string]>(
        'INSERT OR REPLACE INTO reviewed_plans (id, action, target_names, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        plan.id,
        plan.action,
        JSON.stringify(plan.targetNames),
        plan.fingerprint,
        plan.createdAt
      );
    this.enforceRetention();
  }

  find(id: string): ReviewedPlan | undefined {
    this.enforceRetention();
    return this.findStored(id);
  }

  consume(match: ReviewedPlanMatch): ReviewedPlan | undefined {
    this.enforceRetention();
    this.database.run('BEGIN IMMEDIATE');
    try {
      const plan = this.findStored(match.id);
      if (
        plan === undefined ||
        plan.action !== match.action ||
        plan.fingerprint !== match.fingerprint
      ) {
        this.database.run('COMMIT');
        return undefined;
      }
      this.database
        .query<never, [string, string, string]>(
          'DELETE FROM reviewed_plans WHERE id = ? AND action = ? AND fingerprint = ?'
        )
        .run(match.id, match.action, match.fingerprint);
      this.database.run('COMMIT');
      return plan;
    } catch (error) {
      this.database.run('ROLLBACK');
      throw error;
    }
  }

  private findStored(id: string): ReviewedPlan | undefined {
    const row = this.database
      .query<PlanRow, [string]>(
        'SELECT id, action, target_names, fingerprint, created_at FROM reviewed_plans WHERE id = ?'
      )
      .get(id);
    if (row === null) return undefined;
    const targetNames = parseTargetNames(row.target_names);
    if (targetNames === undefined) return undefined;
    const plan: ReviewedPlan = {
      schema: 'mzsh.reviewed-plan/v1',
      id: row.id,
      action: row.action,
      targetNames,
      fingerprint: row.fingerprint,
      state: 'reviewed',
      createdAt: row.created_at,
    };
    return isReviewedPlan(plan) ? plan : undefined;
  }

  record(record: HistoryRecord): void {
    if (!isHistoryRecord(record)) throw new Error('REDACTED_HISTORY_REQUIRED');
    this.database
      .query<never, [string, string, string, string, string, string, string, string]>(
        'INSERT INTO history (id, plan_id, action, target_names, result, snapshot_kind, snapshot_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        record.id,
        record.planId,
        record.action,
        JSON.stringify(record.targetNames),
        record.result,
        record.snapshot.kind,
        JSON.stringify(record.snapshot),
        record.occurredAt
      );
    this.enforceRetention();
  }

  complete(attemptId: string, result: 'applied' | 'failed'): void {
    this.database
      .query<never, [string, string]>('UPDATE history SET result = ? WHERE id = ?')
      .run(result, attemptId);
    this.enforceRetention();
  }

  list(limit: number): readonly HistoryRecord[] {
    this.enforceRetention();
    return this.database
      .query<HistoryRow, [number]>(
        'SELECT id, plan_id, action, target_names, result, snapshot_kind, snapshot_json, occurred_at FROM history ORDER BY occurred_at DESC LIMIT ?'
      )
      .all(limit)
      .flatMap((row) => historyRecord(row));
  }

  prune(before: Date): readonly string[] {
    const rows = this.database
      .query<{ id: string }, [string]>('SELECT id FROM history WHERE occurred_at < ?')
      .all(before.toISOString());
    this.database
      .query<never, [string]>('DELETE FROM history WHERE occurred_at < ?')
      .run(before.toISOString());
    this.database
      .query<never, [string]>('DELETE FROM reviewed_plans WHERE created_at < ?')
      .run(before.toISOString());
    return rows.map((row) => row.id);
  }

  close(): void {
    this.database.close();
  }

  private enforceRetention(now = new Date()): void {
    this.prune(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  }
}

export function findExistingReviewedPlan(directory: string, id: string): ReviewedPlan | undefined {
  const databasePath = join(directory, 'history.sqlite');
  if (!existsSync(databasePath)) return undefined;
  const database = new Database(databasePath, { readonly: true, strict: true });
  try {
    const row = database
      .query<PlanRow, [string]>(
        'SELECT id, action, target_names, fingerprint, created_at FROM reviewed_plans WHERE id = ?'
      )
      .get(id);
    if (row === null) return undefined;
    const targetNames = parseTargetNames(row.target_names);
    if (targetNames === undefined) return undefined;
    const plan: ReviewedPlan = {
      schema: 'mzsh.reviewed-plan/v1',
      id: row.id,
      action: row.action,
      targetNames,
      fingerprint: row.fingerprint,
      state: 'reviewed',
      createdAt: row.created_at,
    };
    return isReviewedPlan(plan) ? plan : undefined;
  } finally {
    database.close();
  }
}

function parseTargetNames(value: string): HistoryRecord['targetNames'] | undefined {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isTargetName)) return undefined;
  return parsed;
}

function isTargetName(value: unknown): value is HistoryRecord['targetNames'][number] {
  return (
    value === 'managed-loader' ||
    value === 'managed-private' ||
    value === 'managed-shims' ||
    value === 'managed-current' ||
    value === 'adoption-receipt'
  );
}

function isReviewedPlan(plan: ReviewedPlan): boolean {
  return (
    plan.schema === 'mzsh.reviewed-plan/v1' &&
    isReviewedPlanId(plan.id) &&
    isAction(plan.action) &&
    parseTargetNames(JSON.stringify(plan.targetNames)) !== undefined &&
    /^[0-9a-f]{64}$/i.test(plan.fingerprint) &&
    isIsoTimestamp(plan.createdAt) &&
    plan.state === 'reviewed'
  );
}

function isHistoryRecord(record: HistoryRecord): boolean {
  return (
    isReviewedPlanId(record.id) &&
    isReviewedPlanId(record.planId) &&
    isAction(record.action) &&
    parseTargetNames(JSON.stringify(record.targetNames)) !== undefined &&
    record.planState === 'reviewed' &&
    (record.result === 'pending' || record.result === 'applied' || record.result === 'failed') &&
    isRecoverySnapshot(record.snapshot) &&
    isIsoTimestamp(record.occurredAt)
  );
}

function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as {
    id?: unknown;
    kind?: unknown;
    capturedAt?: unknown;
    targets?: unknown;
  };
  return (
    typeof snapshot.id === 'string' &&
    isReviewedPlanId(snapshot.id) &&
    (snapshot.kind === 'managed-state' || snapshot.kind === 'adoption-receipt') &&
    typeof snapshot.capturedAt === 'string' &&
    isIsoTimestamp(snapshot.capturedAt) &&
    Array.isArray(snapshot.targets) &&
    snapshot.targets.length > 0 &&
    snapshot.targets.every(isRecoveryTarget)
  );
}

function isRecoveryTarget(value: unknown): value is RecoverySnapshot['targets'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as { name?: unknown; state?: unknown };
  return (
    isTargetName(target.name) &&
    (target.state === 'absent' ||
      target.state === 'file' ||
      target.state === 'symlink' ||
      target.state === 'directory' ||
      target.state === 'other')
  );
}

function parseRecoverySnapshot(value: string): RecoverySnapshot | undefined {
  const parsed: unknown = JSON.parse(value);
  return isRecoverySnapshot(parsed) ? parsed : undefined;
}

function isAction(value: unknown): value is HistoryRecord['action'] {
  return value === 'bootstrap' || value === 'setup' || value === 'update' || value === 'rollback';
}

function isIsoTimestamp(value: string): boolean {
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}

function historyRecord(row: HistoryRow): HistoryRecord[] {
  const targetNames = parseTargetNames(row.target_names);
  const snapshot = parseRecoverySnapshot(row.snapshot_json);
  if (targetNames === undefined || snapshot === undefined || row.snapshot_kind !== snapshot.kind)
    return [];
  const record: HistoryRecord = {
    id: row.id,
    planId: row.plan_id,
    action: row.action,
    targetNames,
    planState: 'reviewed',
    result: row.result,
    snapshot,
    occurredAt: row.occurred_at,
  };
  return isHistoryRecord(record) ? [record] : [];
}
