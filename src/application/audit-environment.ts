import type {
  AuditInventoryRecord,
  AuditFinding,
  AuditFindingCode,
  AuditRemediation,
  AuditSeverity,
  EnvironmentAuditReport,
  EnvironmentSnapshot,
} from '../domain/audit';
import type { InventoryRecord } from '../domain/inventory';
import type { RepositoryInvalidCode, RepositoryState } from '../domain/repository-state';

function finding(
  code: AuditFindingCode,
  severity: AuditSeverity,
  message: string,
  remediation: AuditRemediation
): AuditFinding {
  return { code, severity, message, remediation };
}

const inspectRemediation: AuditRemediation = {
  kind: 'inspect',
  summary: 'Review the reported metadata locally before making changes.',
};

const repositoryInvalidMessages: Readonly<Record<RepositoryInvalidCode, string>> = {
  'repository-root-not-absolute': 'The configured repository root is not absolute.',
  'repository-root-not-directory': 'The configured repository root is not a readable directory.',
  'package-metadata-missing': 'MZSH package metadata is missing.',
  'package-metadata-invalid': 'MZSH package metadata is invalid or unreadable.',
  'package-identity-mismatch': 'The repository package identity is not MZSH.',
  'portable-entrypoint-missing': 'The portable Zsh entrypoint is missing or unreadable.',
};

function redactRepositoryState(repository: RepositoryState): RepositoryState {
  if (repository.kind !== 'invalid') return repository;
  return {
    kind: 'invalid',
    root: repository.root,
    code: repository.code,
    message: repositoryInvalidMessages[repository.code],
  };
}

function redactInventory(records: readonly InventoryRecord[]): readonly AuditInventoryRecord[] {
  return records.map((record) => {
    const metadata = Object.fromEntries(
      Object.entries(record.metadata ?? {}).filter(
        (entry): entry is [string, boolean | number] =>
          typeof entry[1] === 'boolean' || typeof entry[1] === 'number'
      )
    );
    const version = record.version?.match(/^\d+(?:\.\d+){1,3}$/)?.[0];
    return {
      categoryId: record.categoryId,
      status: record.status,
      origin: record.origin,
      ...(version === undefined ? {} : { version }),
      ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    };
  });
}

export function auditEnvironment(
  snapshot: EnvironmentSnapshot,
  inventory: readonly InventoryRecord[] = []
): EnvironmentAuditReport {
  const findings: AuditFinding[] = [];
  const repository = redactRepositoryState(snapshot.repository);

  if (repository.kind === 'missing') {
    findings.push(
      finding('REPOSITORY_MISSING', 'warning', 'The configured MZSH repository root is absent.', {
        kind: 'repair',
        summary: 'Provide a valid local MZSH checkout before installation work.',
      })
    );
  } else if (repository.kind === 'invalid') {
    findings.push(
      finding('REPOSITORY_INVALID', 'error', repository.message, {
        kind: 'repair',
        summary: 'Repair the local checkout metadata and portable entrypoint.',
      })
    );
  }

  const uniquePaths = new Set<string>();
  for (const entry of snapshot.pathEntries) {
    if (uniquePaths.has(entry.path)) {
      findings.push(
        finding('PATH_DUPLICATE', 'warning', 'PATH contains duplicate directory entries.', {
          kind: 'configure',
          summary: 'Deduplicate PATH entries while preserving precedence.',
        })
      );
      break;
    }
    uniquePaths.add(entry.path);
  }

  if (
    snapshot.pathEntries.some((entry) => entry.mode !== undefined && (entry.mode & 0o022) !== 0)
  ) {
    findings.push(
      finding('PATH_DIRECTORY_INSECURE', 'error', 'A PATH directory is group- or other-writable.', {
        kind: 'repair',
        summary: 'Restrict write permissions before trusting executables from that directory.',
      })
    );
  }

  if (snapshot.zshTopology === 'source-all') {
    findings.push(
      finding(
        'ZSH_SOURCE_ALL_TOPOLOGY',
        'warning',
        'Live Zsh configuration sources files as an unordered set.',
        {
          kind: 'configure',
          summary: 'Adopt explicit manifest ordering before managed modules are enabled.',
        }
      )
    );
  }

  if (snapshot.currentLink === 'absent') {
    findings.push(
      finding('MZSH_CURRENT_LINK_ABSENT', 'warning', 'The managed MZSH current link is absent.', {
        kind: 'repair',
        summary: 'Create the managed link only through a guarded adoption step.',
      })
    );
  } else if (snapshot.currentLink === 'broken') {
    findings.push(
      finding('MZSH_CURRENT_LINK_BROKEN', 'error', 'The managed MZSH current link is broken.', {
        kind: 'repair',
        summary: 'Repair the target through a guarded rollback-capable adoption step.',
      })
    );
  }

  const privateFile = snapshot.privateFile;
  if (privateFile.kind === 'absent') {
    findings.push(
      finding(
        'PRIVATE_FILE_ABSENT',
        'info',
        'No local private override file is present.',
        inspectRemediation
      )
    );
  } else if (privateFile.kind === 'symlink') {
    findings.push(
      finding('PRIVATE_FILE_SYMLINK', 'error', 'The local private override is a symlink.', {
        kind: 'repair',
        summary: 'Use an owner-controlled regular file for private overrides.',
      })
    );
  } else if (privateFile.kind === 'other') {
    findings.push(
      finding(
        'PRIVATE_FILE_NON_REGULAR',
        'error',
        'The local private override is not a regular file.',
        {
          kind: 'repair',
          summary: 'Replace the private override with an owner-controlled regular file.',
        }
      )
    );
  } else if (privateFile.kind === 'file') {
    if (privateFile.ownerId === undefined || privateFile.currentUserId === undefined) {
      findings.push(
        finding(
          'PRIVATE_FILE_INSECURE',
          'error',
          'The local private override ownership could not be verified.',
          {
            kind: 'repair',
            summary: 'Verify current-user ownership before loading the private override.',
          }
        )
      );
    } else if (privateFile.ownerId !== privateFile.currentUserId) {
      findings.push(
        finding(
          'PRIVATE_FILE_FOREIGN_OWNER',
          'error',
          'The local private override has a foreign owner.',
          {
            kind: 'repair',
            summary: 'Restore ownership to the current user before loading the file.',
          }
        )
      );
    } else if (privateFile.mode === undefined || (privateFile.mode & 0o077) !== 0) {
      findings.push(
        finding(
          'PRIVATE_FILE_INSECURE',
          'error',
          'The local private override permissions are too broad.',
          {
            kind: 'repair',
            summary: 'Restrict the private override to its owner before loading it.',
          }
        )
      );
    } else {
      findings.push(
        finding(
          'PRIVATE_FILE_SECURE',
          'info',
          'A local private override has owner-only permissions.',
          inspectRemediation
        )
      );
    }
  }

  if (snapshot.nodeOwnership.nvmInteractive && snapshot.nodeOwnership.homebrewPrivateNode) {
    findings.push(
      finding(
        'NODE_OWNERSHIP_CONFLICT',
        'warning',
        'NVM and Homebrew-private Node ownership overlap.',
        {
          kind: 'configure',
          summary: 'Choose one Node owner for interactive shell initialization.',
        }
      )
    );
  }

  if (snapshot.pnpm.status === 'present' && !snapshot.pnpm.globalBinDiscoverable) {
    findings.push(
      finding(
        'PNPM_GLOBAL_BIN_UNDISCOVERABLE',
        'warning',
        'The pnpm global-bin directory is not discoverable on PATH.',
        {
          kind: 'configure',
          summary: 'Expose the pnpm global-bin directory through the ordered PATH configuration.',
        }
      )
    );
  }

  if (snapshot.java.status === 'not-discovered') {
    findings.push(
      finding(
        'JAVA_NOT_DISCOVERED',
        'info',
        'macOS Java home discovery did not find a registered JDK.',
        inspectRemediation
      )
    );
  }

  for (const command of snapshot.commands) {
    if (command.status === 'absent') {
      findings.push(
        finding(
          'OPTIONAL_TOOL_ABSENT',
          'info',
          `Optional tool ${command.name} is absent.`,
          inspectRemediation
        )
      );
    }
  }

  for (const probeName of snapshot.probeFailures) {
    findings.push(
      finding('PROBE_FAILED', 'warning', `Probe ${probeName} could not complete.`, {
        kind: 'inspect',
        summary: 'Review the named probe locally and rerun the audit.',
      })
    );
  }

  return {
    version: 1,
    roots: snapshot.roots,
    repository,
    inventory: redactInventory(inventory),
    findings,
  };
}
