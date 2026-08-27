export type RepositoryInvalidCode =
  | 'repository-root-not-absolute'
  | 'repository-root-not-directory'
  | 'package-metadata-missing'
  | 'package-metadata-invalid'
  | 'package-identity-mismatch'
  | 'portable-entrypoint-missing';

export type RepositoryState =
  | {
      kind: 'present';
      root: string;
      packageName: 'mzsh';
      portableEntrypoint: string;
    }
  | {
      kind: 'missing';
      root: string;
      reason: 'root-absent';
    }
  | {
      kind: 'invalid';
      root: string;
      code: RepositoryInvalidCode;
      message: string;
    };

export type LocalInstallationUpdate =
  | {
      kind: 'ready';
      root: string;
      portableEntrypoint: string;
      action: 'local-update-ready';
    }
  | {
      kind: 'prerequisite-required';
      root: string;
      reason: 'repository-missing' | 'repository-invalid';
      message: string;
    };
