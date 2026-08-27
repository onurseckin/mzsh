import { readFileSync, lstatSync } from 'node:fs';
import type { InteractivePrivateEnvironment } from '../domain/redaction';

const assignment = /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;

export type OpenPrivateBoundary = (path: string) => void;

export class OwnerOnlyPrivateEnvironment implements InteractivePrivateEnvironment {
  constructor(
    private readonly path: string,
    private readonly open: OpenPrivateBoundary,
    private readonly ownerId: () => number | undefined = () => process.getuid?.()
  ) {}

  listNames(): readonly string[] {
    this.requireSafeFile();
    return [
      ...new Set(readFileSync(this.path, 'utf8').split(/\r?\n/).flatMap(nameFromLine)),
    ].sort();
  }

  requestSet(_name: string): void {
    this.requireSafeFile();
    this.open(this.path);
  }

  private requireSafeFile(): void {
    let state: ReturnType<typeof lstatSync>;
    try {
      state = lstatSync(this.path);
    } catch {
      throw new Error('PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED');
    }
    if (!state.isFile() || state.uid !== this.ownerId() || (state.mode & 0o077) !== 0) {
      throw new Error('PRIVATE_ENVIRONMENT_BOUNDARY_REQUIRED');
    }
  }
}

function nameFromLine(line: string): readonly string[] {
  const name = assignment.exec(line.trim())?.[1];
  return name === undefined ? [] : [name];
}
