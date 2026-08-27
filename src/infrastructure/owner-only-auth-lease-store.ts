import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuthLeaseMetadata, AuthLeaseStore } from '../domain/auth';
import { NodeAdoptionFilesystem } from './adoption-filesystem';
import { OwnerOnlyFilesystem } from './owner-only-filesystem';

export class OwnerOnlyAuthLeaseStore implements AuthLeaseStore {
  private readonly directory: string;

  constructor(
    private readonly path: string,
    private readonly ownerOnly = new OwnerOnlyFilesystem(),
    private readonly atomic = new NodeAdoptionFilesystem()
  ) {
    this.directory = dirname(path);
  }

  load(): AuthLeaseMetadata | undefined {
    if (!existsSync(this.path)) return undefined;
    if (!this.hasSafeFile()) throw new Error('AUTH_LEASE_METADATA_UNSAFE');
    return parseLease(readFileSync(this.path, 'utf8'));
  }

  save(value: AuthLeaseMetadata): void {
    this.ownerOnly.ensureDirectory(this.directory);
    this.atomic.writeAtomic(this.path, JSON.stringify(value), 0o600);
    this.ownerOnly.ensureFile(this.path);
  }

  private hasSafeFile(): boolean {
    const state = lstatSync(this.path);
    return state.isFile() && state.uid === process.getuid?.() && (state.mode & 0o777) === 0o600;
  }
}

function parseLease(value: string): AuthLeaseMetadata | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const lease = parsed as { owner?: unknown; expiresAt?: unknown };
    return typeof lease.owner === 'string' && typeof lease.expiresAt === 'string'
      ? { owner: lease.owner, expiresAt: lease.expiresAt }
      : undefined;
  } catch {
    return undefined;
  }
}
