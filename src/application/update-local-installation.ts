import type { LocalInstallationUpdate, RepositoryState } from '../domain/repository-state';
import type { UpdateResult } from '../domain/setup';

export type { UpdateResult } from '../domain/setup';

export function blockedLocalInstallationUpdate(
  state: RepositoryState
): Extract<UpdateResult, { kind: 'blocked' }> | undefined {
  if (state.kind === 'present') return undefined;
  return { kind: 'blocked', code: 'REPOSITORY_INVALID' };
}

export function planLocalInstallationUpdate(state: RepositoryState): LocalInstallationUpdate {
  if (state.kind === 'present') {
    return {
      kind: 'ready',
      root: state.root,
      portableEntrypoint: state.portableEntrypoint,
      action: 'local-update-ready',
    };
  }

  if (state.kind === 'missing') {
    return {
      kind: 'prerequisite-required',
      root: state.root,
      reason: 'repository-missing',
      message: 'A local MZSH checkout is required before an update can be planned.',
    };
  }

  return {
    kind: 'prerequisite-required',
    root: state.root,
    reason: 'repository-invalid',
    message: 'The local MZSH checkout must be repaired before an update can be planned.',
  };
}
