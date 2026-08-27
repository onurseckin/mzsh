export const updateMessages = {
  errors: {
    updateFailed: {
      message: 'Managed local update was not applied',
      action:
        'Inspect the local checkout and retry only after review:\n  • bun run mzsh -- audit\n  • bun run mzsh -- update --source /absolute/mzsh-checkout\n  • add --apply only for an accepted plan',
      code: 'UPDATE_001',
    },
    bootstrapFailed: {
      message: 'Managed bootstrap was not applied',
      action:
        'Use the reversible managed lifecycle:\n  1. bun run mzsh -- audit\n  2. bun run mzsh -- bootstrap --source /absolute/mzsh-checkout\n  3. bun run mzsh -- rollback receipt-id if recovery is needed',
      code: 'UPDATE_002',
    },
    repositoryUnavailable: {
      message: 'Local checkout is unavailable for update planning',
      action:
        'MZSH does not fetch during managed update. Provide an existing local checkout with --source and rerun audit.',
      code: 'UPDATE_003',
    },
  },
  success: {
    completed: 'Managed local update completed with recorded preconditions.',
    bootstrapCompleted: 'Managed bootstrap completed with a receipt.',
  },
  info: {
    starting: 'Planning a local managed update...',
    bootstrapping: 'Planning managed bootstrap.',
    applying: 'Applying an accepted local update plan...',
  },
} as const;
