export const updateMessages = {
  errors: {
    updateFailed: {
      message: 'Managed local update was not applied',
      action:
        'Inspect the local checkout and retry only after review:\n  • bun run mzsh -- audit\n  • bun run mzsh -- update\n  • capture reviewedPlanId, then add --apply --plan-id reviewed-plan-id --confirm APPLY',
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
        'MZSH updates only the managed local checkout after a reviewed plan and clean safety checks.',
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
    applying: 'Applying the captured reviewed update plan...',
  },
} as const;
