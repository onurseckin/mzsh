import type { AccountQuota } from '../infrastructure/agyp/agyp-quota-service';
import type { AccountHealth } from '../infrastructure/agyp/agyp-service';
import type { LiveSession, QuotaSnapshot } from '../domain/agyp/agyp-types';

export interface CommandOutcome {
  exitCode: number;
  /** Formatted output for a human reader. */
  text?: string;
  /** Shell assignments the calling function evals; printed instead of `text`. */
  shell?: string;
  /** Failure detail. Present only when the command did not succeed. */
  error?: string;
  /** Informational aside on a successful command, never a failure. */
  note?: string;
  /** Payload merged into the JSON envelope under `--json`. */
  json?: Record<string, unknown>;
}

export function serializeQuota(snapshot: QuotaSnapshot | null): Record<string, unknown> | null {
  if (snapshot === null) {
    return null;
  }
  return {
    remainingPercentage: snapshot.gemini?.remainingPercentage ?? null,
    resetTime: snapshot.gemini?.resetTime ?? null,
    modelCount: snapshot.gemini?.modelCount ?? 0,
    planName: snapshot.planName,
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
  };
}

export function serializeSessions(sessions: readonly LiveSession[]): Record<string, unknown>[] {
  return sessions.map((session) => ({
    pid: session.pid,
    port: session.port,
    email: session.email,
  }));
}

export function serializeAccount(
  entry: AccountQuota,
  sessionAccount: string | null,
  globalAccount: string | null
): Record<string, unknown> {
  return {
    account: entry.email,
    isSessionAccount: entry.email === sessionAccount,
    isGlobalAccount: entry.email === globalAccount,
    runningSessions: entry.liveSessions.length,
    quota: serializeQuota(entry.snapshot),
  };
}

export function serializeHealth(entry: AccountHealth): Record<string, unknown> {
  return {
    account: entry.email,
    hasStoredSignIn: entry.hasCredential,
    hasRecoverableBackup: entry.hasMirror,
    keychain: entry.keychainPath,
    credentialExpiry: entry.credentialExpiry,
    sandboxReady: entry.sandboxReady,
    sandboxOnlyEntries: entry.strayEntries,
  };
}

/**
 * Wraps a result in a stable envelope.
 *
 * `ok` and `command` are always present so a caller can branch on the result
 * without knowing which command produced it.
 */
export function renderJson(command: string, outcome: CommandOutcome): string {
  const envelope: Record<string, unknown> = {
    ok: outcome.exitCode === 0,
    command,
    ...outcome.json,
  };
  if (outcome.error !== undefined) {
    envelope.error = outcome.error;
  }
  if (outcome.note !== undefined) {
    envelope.note = outcome.note;
  }
  return JSON.stringify(envelope, null, 2);
}
