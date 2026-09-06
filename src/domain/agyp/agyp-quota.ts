import type { QuotaReading, QuotaSnapshot, QuotaSource } from './agyp-types';

interface RawQuotaInfo {
  remainingFraction?: number;
  resetTime?: string;
}

interface RawModelConfig {
  label?: string;
  quotaInfo?: RawQuotaInfo;
}

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

/**
 * Claude and GPT models are surfaced by Antigravity but billed by separate
 * products, and the figures it reports for them do not track real usage.
 * Only the Gemini allowance decides whether an account is usable, so it is the
 * only one measured.
 */
export function isGeminiModel(modelLabel: string): boolean {
  const lowered = modelLabel.toLowerCase();
  return !lowered.includes('claude') && !lowered.includes('gpt');
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

function buildReading(models: readonly RawModelConfig[]): QuotaReading | null {
  if (models.length === 0) {
    return null;
  }

  // Every Gemini model draws on one allowance; the minimum is the honest
  // figure if the backend ever reports them out of step.
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
    remainingPercentage: toPercentage(lowestFraction),
    resetTime,
    modelCount: models.length,
  };
}

/**
 * Parses a `GetUserStatus` response into an account's Gemini allowance.
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

  const geminiModels = extractModelConfigs(userStatus).filter((model) =>
    isGeminiModel(typeof model.label === 'string' ? model.label : '')
  );

  return {
    email: email.trim().toLowerCase(),
    planName: extractPlanName(userStatus),
    gemini: buildReading(geminiModels),
    capturedAt: new Date().toISOString(),
    source,
  };
}

/** Renders a reset instant as a compact "1h 52m" hint. */
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
