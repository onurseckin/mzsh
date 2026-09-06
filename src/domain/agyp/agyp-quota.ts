import type { QuotaPool, QuotaPoolId, QuotaSnapshot, QuotaSource } from './agyp-types';

interface RawQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface RawModelConfig {
  label?: string;
  quotaInfo?: RawQuotaInfo;
}

const POOL_LABELS: Record<QuotaPoolId, string> = {
  gemini: 'Gemini',
  premium: 'Claude/GPT',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The language server serialises with proto3 JSON semantics, which omit
 * zero-valued scalars. A model whose `quotaInfo` carries a `resetTime` but no
 * `remainingFraction` is therefore fully exhausted, not "unknown" — reading it
 * as unknown makes an empty account look healthy.
 */
export function readRemainingFraction(quotaInfo: RawQuotaInfo | undefined): number {
  if (!quotaInfo) {
    return 0;
  }
  const fraction = quotaInfo.remainingFraction;
  return typeof fraction === 'number' && Number.isFinite(fraction) ? fraction : 0;
}

export function classifyPool(modelLabel: string): QuotaPoolId {
  const lowered = modelLabel.toLowerCase();
  return lowered.includes('claude') || lowered.includes('gpt') ? 'premium' : 'gemini';
}

function toPercentage(fraction: number): number {
  const scaled = Math.round(fraction * 1000) / 10;
  return Math.max(0, Math.min(100, scaled));
}

function extractModelConfigs(userStatus: Record<string, unknown>): RawModelConfig[] {
  const cascade = asRecord(userStatus.cascadeModelConfigData);
  const configs = cascade?.clientModelConfigs;
  return Array.isArray(configs) ? (configs as RawModelConfig[]) : [];
}

function extractPlanName(userStatus: Record<string, unknown>): string | null {
  const planStatus = asRecord(userStatus.planStatus);
  const planInfo = asRecord(planStatus?.planInfo);
  const planName = planInfo?.planName ?? planStatus?.planName;
  return typeof planName === 'string' && planName.length > 0 ? planName : null;
}

function buildPool(id: QuotaPoolId, models: RawModelConfig[]): QuotaPool {
  // Models inside a pool share one allowance; the minimum is the honest figure
  // if the backend ever reports them out of step.
  let lowestFraction = Number.POSITIVE_INFINITY;
  let resetTime: string | null = null;

  for (const model of models) {
    const fraction = readRemainingFraction(model.quotaInfo);
    if (fraction < lowestFraction) {
      lowestFraction = fraction;
    }
    const candidateReset = model.quotaInfo?.resetTime;
    if (resetTime === null && typeof candidateReset === 'string' && candidateReset.length > 0) {
      resetTime = candidateReset;
    }
  }

  return {
    id,
    label: POOL_LABELS[id],
    remainingPercentage: toPercentage(
      lowestFraction === Number.POSITIVE_INFINITY ? 0 : lowestFraction
    ),
    resetTime,
    modelCount: models.length,
  };
}

/**
 * Parses a `GetUserStatus` response into a per-pool quota snapshot.
 * Returns null when the payload carries no identifiable account.
 */
export function parseUserStatus(payload: unknown, source: QuotaSource): QuotaSnapshot | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const userStatus = asRecord(root.userStatus) ?? root;
  const email = userStatus.email;
  if (typeof email !== 'string' || !email.includes('@')) {
    return null;
  }

  const grouped = new Map<QuotaPoolId, RawModelConfig[]>();
  for (const model of extractModelConfigs(userStatus)) {
    const label = typeof model.label === 'string' ? model.label : '';
    const poolId = classifyPool(label);
    const bucket = grouped.get(poolId);
    if (bucket) {
      bucket.push(model);
    } else {
      grouped.set(poolId, [model]);
    }
  }

  const pools: QuotaPool[] = [];
  for (const poolId of ['gemini', 'premium'] as const) {
    const models = grouped.get(poolId);
    if (models && models.length > 0) {
      pools.push(buildPool(poolId, models));
    }
  }

  return {
    email: email.trim().toLowerCase(),
    planName: extractPlanName(userStatus),
    pools,
    capturedAt: new Date().toISOString(),
    source,
  };
}

export function lowestRemainingPercentage(snapshot: QuotaSnapshot): number | null {
  if (snapshot.pools.length === 0) {
    return null;
  }
  return snapshot.pools.reduce(
    (lowest, pool) => Math.min(lowest, pool.remainingPercentage),
    Number.POSITIVE_INFINITY
  );
}

export function findPool(snapshot: QuotaSnapshot, id: QuotaPoolId): QuotaPool | undefined {
  return snapshot.pools.find((pool) => pool.id === id);
}

/** Renders a reset instant as a compact "in 1h 52m" hint. */
export function formatResetHint(resetTime: string | null, now: Date = new Date()): string {
  if (!resetTime) {
    return '';
  }
  const reset = new Date(resetTime);
  if (Number.isNaN(reset.getTime())) {
    return '';
  }
  const deltaMinutes = Math.round((reset.getTime() - now.getTime()) / 60000);
  if (deltaMinutes <= 0) {
    return 'due';
  }
  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
