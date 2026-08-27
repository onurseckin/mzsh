export const defaultAuthLeaseMilliseconds = 24 * 60 * 60 * 1000;

export interface AuthLeaseMetadata {
  readonly owner: string;
  readonly expiresAt: string;
}

export interface AuthLeaseStore {
  load(): AuthLeaseMetadata | undefined;
  save(value: AuthLeaseMetadata): void;
}

export interface OperatingSystemAuthorization {
  authorize(owner: string): boolean;
}

export function isActiveAuthLease(
  value: AuthLeaseMetadata | undefined,
  owner: string,
  now: Date
): value is AuthLeaseMetadata {
  if (value === undefined || value.owner !== owner || !isSafeAuthLeaseOwner(value.owner))
    return false;
  const expiry = new Date(value.expiresAt);
  return (
    !Number.isNaN(expiry.getTime()) && expiry.toISOString() === value.expiresAt && expiry > now
  );
}

export function isSafeAuthLeaseOwner(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}
