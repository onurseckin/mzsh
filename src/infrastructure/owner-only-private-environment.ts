import type { InteractivePrivateEnvironment } from '../domain/redaction';
import { NodeAdoptionFilesystem, type RegularFileSnapshot } from './adoption-filesystem';

const assignment = /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;

export type OpenPrivateBoundary = (path: string) => void;

export interface PrivateEnvironmentFilesystem {
  hasSafeAtomicParent(path: string): boolean;
  currentUserId(): number | undefined;
  readRegularUtf8NoFollow(path: string): RegularFileSnapshot;
}

export class OwnerOnlyPrivateEnvironment implements InteractivePrivateEnvironment {
  constructor(
    private readonly path: string,
    private readonly open: OpenPrivateBoundary,
    private readonly filesystem: PrivateEnvironmentFilesystem = new NodeAdoptionFilesystem()
  ) {}

  listNames(): readonly string[] {
    const text = this.readSafeText();
    return [...new Set(text.split(/\r?\n/).flatMap(nameFromLine))].sort();
  }

  requestSet(_name: string): void {
    this.readSafeText();
    throw new Error('PRIVATE_ENVIRONMENT_SECURE_HANDOFF_REQUIRED');
  }

  private readSafeText(): string {
    if (!this.filesystem.hasSafeAtomicParent(this.path)) {
      throw new Error('PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED');
    }
    let snapshot: RegularFileSnapshot;
    try {
      snapshot = this.filesystem.readRegularUtf8NoFollow(this.path);
    } catch {
      throw new Error('PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED');
    }
    if (
      snapshot.state.kind !== 'file' ||
      snapshot.state.ownerId !== this.filesystem.currentUserId() ||
      ((snapshot.state.mode ?? 0) & 0o077) !== 0
    ) {
      throw new Error('PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED');
    }
    return snapshot.text;
  }
}

function nameFromLine(line: string): readonly string[] {
  const name = assignment.exec(line.trim())?.[1];
  return name === undefined ? [] : [name];
}
