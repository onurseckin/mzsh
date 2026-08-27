import { describe, expect, test } from 'bun:test';
import { auditEnvironment } from '../src/application/audit-environment';
import type { EnvironmentSnapshot } from '../src/domain/audit';
import {
  commandMetadataFromVersionResult,
  EnvironmentProbes,
  homebrewNodePresenceFromResult,
  type EnvironmentProbeDependencies,
} from '../src/infrastructure/environment-probes';

function snapshot(overrides: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    roots: {
      home: '/isolated/home',
      xdgConfig: '/isolated/home/.config',
      xdgCache: '/isolated/home/.cache',
      repository: '/isolated/repository',
    },
    repository: {
      kind: 'present',
      root: '/isolated/repository',
      packageName: 'mzsh',
      portableEntrypoint: '/isolated/repository/portable/zsh/init.zsh',
    },
    pathEntries: [],
    zshTopology: 'modular',
    currentLink: 'valid',
    privateFile: { kind: 'absent', assignmentCount: 0 },
    nodeOwnership: { nvmInteractive: false, homebrewPrivateNode: false },
    pnpm: { status: 'absent', globalBinDiscoverable: false },
    java: { status: 'not-applicable' },
    commands: [],
    probeFailures: [],
    ...overrides,
  };
}

function codes(report: ReturnType<typeof auditEnvironment>): string[] {
  return report.findings.map((finding) => finding.code);
}

describe('environment audit', () => {
  test('reports repository, PATH, topology, link, ownership, and optional-tool findings without secrets', () => {
    const report = auditEnvironment(
      snapshot({
        pathEntries: [
          { path: '/isolated/bin', mode: 0o755 },
          { path: '/isolated/bin', mode: 0o755 },
          { path: '/isolated/writable', mode: 0o777 },
        ],
        zshTopology: 'source-all',
        currentLink: 'broken',
        privateFile: { kind: 'symlink', assignmentCount: 3 },
        nodeOwnership: { nvmInteractive: true, homebrewPrivateNode: true },
        pnpm: { status: 'present', globalBinDiscoverable: false },
        java: { status: 'not-discovered' },
        commands: [
          {
            name: 'node',
            status: 'present',
            executablePath: '/isolated/bin/node',
            version: 'v22.0.0',
          },
        ],
        probeFailures: ['managed-link'],
      })
    );

    expect(codes(report)).toEqual(
      expect.arrayContaining([
        'PATH_DUPLICATE',
        'PATH_DIRECTORY_INSECURE',
        'ZSH_SOURCE_ALL_TOPOLOGY',
        'MZSH_CURRENT_LINK_BROKEN',
        'PRIVATE_FILE_SYMLINK',
        'NODE_OWNERSHIP_CONFLICT',
        'PNPM_GLOBAL_BIN_UNDISCOVERABLE',
        'JAVA_NOT_DISCOVERED',
        'PROBE_FAILED',
      ])
    );
    const serialized = JSON.stringify(report);
    expect(JSON.parse(serialized)).toEqual(report);
    expect(serialized).not.toContain('assignmentCount');
  });

  test('classifies private file absence, secure files, insecure permissions, and foreign ownership', () => {
    expect(
      codes(auditEnvironment(snapshot({ privateFile: { kind: 'absent', assignmentCount: 0 } })))
    ).toContain('PRIVATE_FILE_ABSENT');
    expect(
      codes(
        auditEnvironment(
          snapshot({
            privateFile: {
              kind: 'file',
              mode: 0o600,
              ownerId: 501,
              currentUserId: 501,
              assignmentCount: 2,
            },
          })
        )
      )
    ).toContain('PRIVATE_FILE_SECURE');
    expect(
      codes(
        auditEnvironment(
          snapshot({
            privateFile: {
              kind: 'file',
              mode: 0o644,
              ownerId: 501,
              currentUserId: 501,
              assignmentCount: 2,
            },
          })
        )
      )
    ).toContain('PRIVATE_FILE_INSECURE');
    expect(
      codes(
        auditEnvironment(
          snapshot({
            privateFile: {
              kind: 'file',
              mode: 0o600,
              ownerId: 502,
              currentUserId: 501,
              assignmentCount: 2,
            },
          })
        )
      )
    ).toContain('PRIVATE_FILE_FOREIGN_OWNER');
    expect(
      codes(
        auditEnvironment(
          snapshot({
            privateFile: {
              kind: 'other',
              mode: 0o700,
              ownerId: 501,
              currentUserId: 501,
              assignmentCount: 0,
            },
          })
        )
      )
    ).toContain('PRIVATE_FILE_NON_REGULAR');
    expect(
      codes(
        auditEnvironment(
          snapshot({ privateFile: { kind: 'file', mode: 0o600, assignmentCount: 2 } })
        )
      )
    ).toContain('PRIVATE_FILE_INSECURE');
  });

  test('keeps absent optional commands informational and redacts probe failures to their probe names', () => {
    const report = auditEnvironment(
      snapshot({
        commands: [{ name: 'pnpm', status: 'absent' }],
        probeFailures: ['private-file'],
      })
    );

    const pnpmAbsent = report.findings.find((finding) => finding.code === 'OPTIONAL_TOOL_ABSENT');
    const failedProbe = report.findings.find((finding) => finding.code === 'PROBE_FAILED');
    expect(pnpmAbsent?.severity).toBe('info');
    expect(failedProbe).toEqual({
      code: 'PROBE_FAILED',
      severity: 'warning',
      message: 'Probe private-file could not complete.',
      remediation: {
        kind: 'inspect',
        summary: 'Review the named probe locally and rerun the audit.',
      },
    });
  });

  test('detects source-all loops while leaving explicit manifest sourcing modular', () => {
    const dependencies: EnvironmentProbeDependencies = {
      environment: { HOME: '/isolated/home', PATH: '/isolated/bin' },
      platform: 'darwin',
      inspectPath: () => undefined,
      readText: (path) =>
        path === '/isolated/.zshrc'
          ? [
              'for config_file in "$ZSH_CONFIG_DIR"/*.zsh; do',
              '  source "$config_file"',
              'done',
            ].join('\n')
          : undefined,
      inspectLink: () => 'absent',
      inspectRepository: (root) => ({
        kind: 'present',
        root,
        packageName: 'mzsh',
        portableEntrypoint: '/isolated/repository/portable/zsh/init.zsh',
      }),
      inspectCommand: (name) => ({ name, status: 'absent' }),
      inspectPnpmGlobalBinDirectory: () => ({ status: 'absent' }),
      inspectJavaHomeDiscovery: () => 'not-discovered',
      inspectHomebrewNode: () => 'absent',
    };
    const probes = new EnvironmentProbes(dependencies);

    expect(
      probes.collect({ repositoryRoot: '/isolated/repository', zshrc: '/isolated/.zshrc' })
        .zshTopology
    ).toBe('source-all');
    expect(
      new EnvironmentProbes({
        ...dependencies,
        readText: (path) =>
          path === '/isolated/.zshrc'
            ? 'source "$HOME/.config/mzsh/manifest.zsh"\nsource "$HOME/.config/mzsh/modules/path.zsh"\n'
            : undefined,
      }).collect({ repositoryRoot: '/isolated/repository', zshrc: '/isolated/.zshrc' }).zshTopology
    ).toBe('modular');
  });

  test('uses the adopted private target, counts exported assignment shapes, and checks the configured pnpm bin directory', () => {
    const dependencies: EnvironmentProbeDependencies = {
      environment: {
        HOME: '/isolated/home',
        PATH: '/isolated/bin:/isolated/bin:/isolated/home/Library/pnpm',
        PNPM_HOME: '/isolated/home/Library/pnpm',
      },
      platform: 'darwin',
      currentUserId: 501,
      inspectPath: (path) => {
        if (path === '/isolated/home/.config/mzsh/private.zsh')
          return { kind: 'file', mode: 0o600, ownerId: 501 };
        if (path === '/isolated/bin') return { kind: 'directory', mode: 0o755 };
        if (path === '/isolated/home/Library/pnpm') return { kind: 'directory', mode: 0o755 };
        return undefined;
      },
      readText: (path) => {
        if (path === '/isolated/.zshrc')
          return 'source "$HOME/.config/zsh/"*.zsh\nsource "$NVM_DIR/nvm.sh"\n';
        if (path === '/isolated/home/.config/mzsh/private.zsh') {
          return 'MZSH_API_TOKEN=private-value\nexport MZSH_REGION=private-region\ntypeset -gx MZSH_RUNTIME_OWNER=private-runtime\n';
        }
        return undefined;
      },
      inspectLink: () => 'broken',
      inspectRepository: (root) => ({
        kind: 'present',
        root,
        packageName: 'mzsh',
        portableEntrypoint: '/isolated/repository/portable/zsh/init.zsh',
      }),
      inspectCommand: (name) =>
        name === 'java'
          ? { name, status: 'absent' }
          : { name, status: 'present', executablePath: `/isolated/bin/${name}`, version: 'v1.0.0' },
      inspectPnpmGlobalBinDirectory: () => ({
        status: 'present',
        directory: '/isolated/home/Library/pnpm/bin',
      }),
      inspectJavaHomeDiscovery: () => 'not-discovered',
      inspectHomebrewNode: () => 'present',
    };

    const collected = new EnvironmentProbes(dependencies).collect({
      repositoryRoot: '/isolated/repository',
      zshrc: '/isolated/.zshrc',
      managedCurrentLink: '/isolated/current',
    });
    const report = auditEnvironment(collected);
    const serialized = JSON.stringify(report);

    expect(collected.privateFile.assignmentCount).toBe(3);
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        'PATH_DUPLICATE',
        'ZSH_SOURCE_ALL_TOPOLOGY',
        'MZSH_CURRENT_LINK_BROKEN',
        'PRIVATE_FILE_SECURE',
        'NODE_OWNERSHIP_CONFLICT',
        'PNPM_GLOBAL_BIN_UNDISCOVERABLE',
      ])
    );
    expect(serialized).not.toContain('MZSH_API_TOKEN');
    expect(serialized).not.toContain('private-value');
  });

  test('keeps runnable Java separate from macOS JDK discovery', () => {
    const java = commandMetadataFromVersionResult(
      'java',
      '/usr/bin/java',
      1,
      'java stub diagnostic'
    );
    const runnableJava = commandMetadataFromVersionResult(
      'java',
      '/opt/homebrew/bin/java',
      0,
      '17.0.1'
    );
    const report = auditEnvironment(
      snapshot({ commands: [runnableJava], java: { status: 'not-discovered' } })
    );

    expect(java).toEqual({ name: 'java', status: 'absent' });
    expect(runnableJava.status).toBe('present');
    expect(codes(report)).toContain('JAVA_NOT_DISCOVERED');
    expect(codes(report)).not.toContain('OPTIONAL_TOOL_ABSENT');
    expect(JSON.stringify(report)).not.toContain('runnable Java command');
    expect(JSON.stringify(report)).not.toContain('java stub diagnostic');
  });

  test('records failed pnpm metadata probes without retaining diagnostics', () => {
    const baseDependencies: EnvironmentProbeDependencies = {
      environment: { HOME: '/isolated/home', PATH: '/isolated/bin' },
      platform: 'darwin',
      inspectPath: () => undefined,
      readText: () => undefined,
      inspectLink: () => 'absent',
      inspectRepository: (root) => ({
        kind: 'present',
        root,
        packageName: 'mzsh',
        portableEntrypoint: '/isolated/repository/portable/zsh/init.zsh',
      }),
      inspectCommand: (name) =>
        name === 'pnpm'
          ? { name, status: 'present', executablePath: '/isolated/bin/pnpm', version: 'v11.0.0' }
          : { name, status: 'absent' },
      inspectPnpmGlobalBinDirectory: () => ({ status: 'failed' }),
      inspectJavaHomeDiscovery: () => 'not-discovered',
      inspectHomebrewNode: () => 'absent',
    };

    const report = auditEnvironment(
      new EnvironmentProbes(baseDependencies).collect({ repositoryRoot: '/isolated/repository' })
    );

    expect(codes(report)).toEqual(
      expect.arrayContaining(['PNPM_GLOBAL_BIN_UNDISCOVERABLE', 'PROBE_FAILED'])
    );
    expect(JSON.stringify(report)).toContain('pnpm-global-bin');
  });

  test('redacts injected repository errors at the report boundary', () => {
    const report = auditEnvironment(
      snapshot({
        repository: {
          kind: 'invalid',
          root: '/isolated/repository',
          code: 'package-metadata-invalid',
          message: 'sentinel raw filesystem diagnostic',
        },
      })
    );

    expect(codes(report)).toContain('REPOSITORY_INVALID');
    expect(JSON.stringify(report)).not.toContain('sentinel raw filesystem diagnostic');
  });

  test('requires installed-only Homebrew metadata for Node ownership', () => {
    expect(homebrewNodePresenceFromResult(1, '/opt/homebrew/opt/node')).toBe('absent');
    expect(homebrewNodePresenceFromResult(0, '/opt/homebrew/opt/node')).toBe('present');
  });
});
