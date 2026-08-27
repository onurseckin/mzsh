import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  AuditProbeName,
  CommandMetadata,
  EnvironmentSnapshot,
  PathEntryMetadata,
  PrivateFileMetadata,
} from '../domain/audit';
import type { RepositoryState } from '../domain/repository-state';
import { LocalRepository } from './local-repository';
import {
  inspectPnpmRuntimeDirectory,
  type PnpmGlobalBinProbeResult,
} from './pnpm-runtime-path-probe';

type PathKind = 'file' | 'directory' | 'symlink' | 'other';

export interface PathProbeResult {
  kind: PathKind;
  mode?: number;
  ownerId?: number;
}

export interface EnvironmentProbeDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly currentUserId?: number;
  inspectPath(path: string): PathProbeResult | undefined;
  readText(path: string): string | undefined;
  inspectLink(path: string): 'valid' | 'absent' | 'broken';
  inspectRepository(root: string): RepositoryState;
  inspectCommand(name: 'node' | 'pnpm' | 'java'): CommandMetadata;
  inspectPnpmRuntimeDirectory(
    xdgConfig: string,
    currentUserId: number | undefined
  ): PnpmGlobalBinProbeResult;
  inspectJavaHomeDiscovery(): JavaHomeProbeResult;
  inspectHomebrewNode(): PresenceProbeResult;
}

export type PresenceProbeResult = 'present' | 'absent' | 'failed';
export type JavaHomeProbeResult = 'discovered' | 'not-discovered' | 'failed';

export interface EnvironmentProbeOptions {
  home?: string;
  xdgConfig?: string;
  xdgCache?: string;
  repositoryRoot: string;
  managedCurrentLink?: string;
  privateFile?: string;
  zshrc?: string;
}

function modeOf(stat: { mode: number | bigint }): number {
  return Number(stat.mode) & 0o777;
}

function inspectPath(path: string): PathProbeResult | undefined {
  try {
    const stat = lstatSync(path);
    if (stat.isFile()) return { kind: 'file', mode: modeOf(stat), ownerId: stat.uid };
    if (stat.isDirectory()) return { kind: 'directory', mode: modeOf(stat), ownerId: stat.uid };
    if (stat.isSymbolicLink()) return { kind: 'symlink', mode: modeOf(stat), ownerId: stat.uid };
    return { kind: 'other', mode: modeOf(stat), ownerId: stat.uid };
  } catch {
    return undefined;
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function inspectLink(path: string): 'valid' | 'absent' | 'broken' {
  const metadata = inspectPath(path);
  if (metadata === undefined) return 'absent';
  if (metadata.kind !== 'symlink') return 'broken';
  try {
    realpathSync(path);
    return 'valid';
  } catch {
    return 'broken';
  }
}

function versionFromOutput(output: string): string | undefined {
  const version = output.match(/v?\d+(?:\.\d+){1,3}/)?.[0];
  return version === undefined ? undefined : version.startsWith('v') ? version : `v${version}`;
}

export function commandMetadataFromVersionResult(
  name: 'node' | 'pnpm' | 'java',
  executablePath: string,
  exitStatus: number | null | undefined,
  output: string
): CommandMetadata {
  if (exitStatus !== 0) return { name, status: 'absent' };

  return {
    name,
    status: 'present',
    executablePath,
    version: versionFromOutput(output),
  };
}

function inspectCommand(name: 'node' | 'pnpm' | 'java'): CommandMetadata {
  const executablePath = Bun.which(name);
  if (executablePath === null) return { name, status: 'absent' };

  const result = spawnSync(executablePath, ['--version'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return commandMetadataFromVersionResult(name, executablePath, result.status, output);
}

function inspectJavaHomeDiscovery(): JavaHomeProbeResult {
  const result = spawnSync('/usr/libexec/java_home', [], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (result.error !== undefined) return 'failed';
  return result.status === 0 ? 'discovered' : 'not-discovered';
}

function inspectHomebrewNode(): PresenceProbeResult {
  const brew = Bun.which('brew');
  if (brew === null) return 'absent';

  const result = spawnSync(brew, ['--prefix', '--installed', 'node'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error !== undefined || typeof result.stdout !== 'string') return 'failed';
  return homebrewNodePresenceFromResult(result.status, result.stdout);
}

export function homebrewNodePresenceFromResult(
  exitStatus: number | null | undefined,
  output: string
): PresenceProbeResult {
  if (exitStatus !== 0) return 'absent';
  const prefix = output.trim();
  return prefix.length > 0 && !prefix.includes('\n') && isAbsolute(prefix) ? 'present' : 'failed';
}

function defaultDependencies(): EnvironmentProbeDependencies {
  return {
    environment: process.env,
    platform: process.platform,
    currentUserId: typeof process.getuid === 'function' ? process.getuid() : undefined,
    inspectPath,
    readText,
    inspectLink,
    inspectRepository: (root) => new LocalRepository().inspect(root),
    inspectCommand,
    inspectPnpmRuntimeDirectory,
    inspectJavaHomeDiscovery,
    inspectHomebrewNode,
  };
}

function countAssignmentShapes(content: string | undefined): number {
  if (content === undefined) return 0;
  return content
    .split('\n')
    .filter((line) =>
      /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(line.trim())
    ).length;
}

function usesSourceAll(content: string | undefined): boolean {
  if (content === undefined) return false;
  if (/(?:^|\n)\s*(?:source|\.)\s+[^\n]*\*/m.test(content)) return true;

  const loopPattern = /for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+[^\n]*\*\.zsh\s*;?\s*do/g;
  for (const loop of content.matchAll(loopPattern)) {
    const variableName = loop[1];
    if (variableName === undefined || loop.index === undefined) continue;
    const sourcePattern = new RegExp(
      `(?:^|\\n)\\s*(?:source|\\.)\\s+["']?\\$${variableName}(?:["']|\\b)`
    );
    if (sourcePattern.test(content.slice(loop.index + loop[0].length))) return true;
  }

  return false;
}

function usesNvm(content: string | undefined): boolean {
  return content !== undefined && /(?:nvm\.sh|NVM_DIR)/.test(content);
}

export class EnvironmentProbes {
  constructor(
    private readonly dependencies: EnvironmentProbeDependencies = defaultDependencies()
  ) {}

  collect(options: EnvironmentProbeOptions): EnvironmentSnapshot {
    const home = options.home ?? this.dependencies.environment.HOME ?? homedir();
    const xdgConfig =
      options.xdgConfig ?? this.dependencies.environment.XDG_CONFIG_HOME ?? join(home, '.config');
    const xdgCache =
      options.xdgCache ?? this.dependencies.environment.XDG_CACHE_HOME ?? join(home, '.cache');
    const zshrc = options.zshrc ?? join(home, '.zshrc');
    const privateFile = options.privateFile ?? join(xdgConfig, 'mzsh', 'private.zsh');
    const managedCurrentLink = options.managedCurrentLink ?? join(xdgConfig, 'mzsh', 'current');
    const pathEntries = this.collectPathEntries(this.dependencies.environment.PATH ?? '');
    const failures: AuditProbeName[] = [];
    const zshrcContent = this.safeRead('zsh-topology', zshrc, failures);
    const privateContent = this.safeRead('private-file', privateFile, failures);
    const privateMetadata = this.dependencies.inspectPath(privateFile);
    if (privateMetadata === undefined && privateContent !== undefined)
      failures.push('private-file');

    const privateState: PrivateFileMetadata =
      privateMetadata === undefined
        ? { kind: 'absent', assignmentCount: 0 }
        : {
            kind:
              privateMetadata.kind === 'file' || privateMetadata.kind === 'symlink'
                ? privateMetadata.kind
                : 'other',
            mode: privateMetadata.mode,
            ownerId: privateMetadata.ownerId,
            currentUserId: this.dependencies.currentUserId,
            assignmentCount: countAssignmentShapes(privateContent),
          };

    const currentLink = this.safeLink(managedCurrentLink, failures);
    const commands = (['node', 'pnpm', 'java'] as const).map((name) =>
      this.safeCommand(name, failures)
    );
    const pnpm = commands.find((command) => command.name === 'pnpm') ?? {
      name: 'pnpm',
      status: 'absent' as const,
    };
    const pnpmGlobalBin =
      pnpm.status === 'present'
        ? this.safePnpmRuntimeDirectory(xdgConfig, failures)
        : { status: 'absent' as const };
    const javaHome =
      this.dependencies.platform === 'darwin'
        ? this.safeJavaHomeDiscovery(failures)
        : 'not-applicable';
    const homebrewNode = this.safeHomebrewNode(failures);

    return {
      roots: { home, xdgConfig, xdgCache, repository: options.repositoryRoot },
      repository: this.safeRepository(options.repositoryRoot, failures),
      pathEntries,
      zshTopology: usesSourceAll(zshrcContent)
        ? 'source-all'
        : zshrcContent === undefined
          ? 'unknown'
          : 'modular',
      currentLink,
      privateFile: privateState,
      nodeOwnership: {
        nvmInteractive: usesNvm(zshrcContent),
        homebrewPrivateNode: homebrewNode === 'present',
      },
      pnpm: {
        status: pnpm.status,
        globalBinDiscoverable:
          pnpmGlobalBin.status === 'present' &&
          pathEntries.some((entry) => entry.path === pnpmGlobalBin.directory),
      },
      java: { status: javaHome },
      commands,
      probeFailures: failures,
    };
  }

  private collectPathEntries(pathValue: string): PathEntryMetadata[] {
    return pathValue
      .split(delimiter)
      .filter((path) => path.length > 0)
      .map((path) => ({ path, mode: this.dependencies.inspectPath(path)?.mode }));
  }

  private safeRead(
    probe: 'zsh-topology' | 'private-file',
    path: string,
    failures: AuditProbeName[]
  ): string | undefined {
    try {
      return this.dependencies.readText(path);
    } catch {
      failures.push(probe);
      return undefined;
    }
  }

  private safeLink(path: string, failures: AuditProbeName[]): 'valid' | 'absent' | 'broken' {
    try {
      return this.dependencies.inspectLink(path);
    } catch {
      failures.push('managed-link');
      return 'absent';
    }
  }

  private safeRepository(root: string, failures: AuditProbeName[]): RepositoryState {
    try {
      return this.dependencies.inspectRepository(root);
    } catch {
      failures.push('repository-state');
      return {
        kind: 'invalid',
        root,
        code: 'package-metadata-invalid',
        message: 'Repository metadata could not be inspected.',
      };
    }
  }

  private safeCommand(name: 'node' | 'pnpm' | 'java', failures: AuditProbeName[]): CommandMetadata {
    try {
      return this.dependencies.inspectCommand(name);
    } catch {
      const probeName: AuditProbeName = `command-${name}`;
      failures.push(probeName);
      return { name, status: 'absent' };
    }
  }

  private safePnpmRuntimeDirectory(
    xdgConfig: string,
    failures: AuditProbeName[]
  ): PnpmGlobalBinProbeResult {
    try {
      const result = this.dependencies.inspectPnpmRuntimeDirectory(
        xdgConfig,
        this.dependencies.currentUserId
      );
      if (result.status === 'failed') failures.push('pnpm-global-bin');
      return result;
    } catch {
      failures.push('pnpm-global-bin');
      return { status: 'failed' };
    }
  }

  private safeJavaHomeDiscovery(failures: AuditProbeName[]): 'discovered' | 'not-discovered' {
    try {
      const result = this.dependencies.inspectJavaHomeDiscovery();
      if (result === 'failed') {
        failures.push('java-home');
        return 'not-discovered';
      }
      return result;
    } catch {
      failures.push('java-home');
      return 'not-discovered';
    }
  }

  private safeHomebrewNode(failures: AuditProbeName[]): PresenceProbeResult {
    try {
      const result = this.dependencies.inspectHomebrewNode();
      if (result === 'failed') failures.push('homebrew-node');
      return result;
    } catch {
      failures.push('homebrew-node');
      return 'failed';
    }
  }
}
