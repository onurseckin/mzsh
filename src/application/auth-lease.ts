import {
  defaultAuthLeaseMilliseconds,
  isActiveAuthLease,
  isSafeAuthLeaseOwner,
  type AuthLeaseMetadata,
  type AuthLeaseStore,
  type OperatingSystemAuthorization,
} from '../domain/auth';

export interface AuthLeaseServiceOptions {
  readonly authorization: OperatingSystemAuthorization;
  readonly store: AuthLeaseStore;
  readonly owner: () => string;
  readonly now?: () => Date;
  readonly leaseMilliseconds?: number;
}

export class AuthLeaseService {
  private readonly now: () => Date;
  private readonly leaseMilliseconds: number;

  constructor(private readonly options: AuthLeaseServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.leaseMilliseconds = options.leaseMilliseconds ?? defaultAuthLeaseMilliseconds;
  }

  acquire(): AuthLeaseMetadata {
    const owner = this.options.owner();
    if (!isSafeAuthLeaseOwner(owner)) throw new Error('AUTH_LEASE_OWNER_INVALID');
    const now = this.now();
    const active = this.options.store.load();
    if (isActiveAuthLease(active, owner, now)) return active;
    if (!this.options.authorization.authorize(owner)) throw new Error('OS_AUTHORIZATION_REQUIRED');
    const lease = {
      owner,
      expiresAt: new Date(now.getTime() + this.leaseMilliseconds).toISOString(),
    };
    this.options.store.save(lease);
    return lease;
  }

  isActive(): boolean {
    return isActiveAuthLease(this.options.store.load(), this.options.owner(), this.now());
  }
}
