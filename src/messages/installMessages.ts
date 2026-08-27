export const installMessages = {
  errors: {
    checkoutUnavailable: {
      message: 'Local MZSH checkout is unavailable',
      action:
        'Clone or enter a reviewed checkout, then run:\n  • bun install\n  • bun run mzsh -- audit',
      code: 'INSTALL_001',
    },
    bunUnavailable: {
      message: 'Bun is not installed',
      action: 'Install Bun through your normal toolchain, then rerun the checkout-local audit.',
      code: 'INSTALL_002',
    },
    buildFailed: {
      message: 'Build failed',
      action:
        'Check the build output, run bun install in the checkout, and resolve TypeScript errors before retrying.',
      code: 'INSTALL_003',
    },
    bootstrapFailed: {
      message: 'Managed bootstrap was not applied',
      action:
        'Review the dry-run plan, resolve its finding, then opt in:\n  • bun run mzsh -- audit\n  • bun run mzsh -- bootstrap --source /absolute/mzsh-checkout\n  • bun run mzsh -- bootstrap --source /absolute/mzsh-checkout --apply',
      code: 'INSTALL_004',
    },
    managedStateUnavailable: {
      message: 'Managed configuration is not active',
      action:
        'Open the managed stable loader from the default menu, verify its receipt, then use rollback if needed.',
      code: 'INSTALL_005',
    },
  },
  success: {
    completed: 'Managed bootstrap completed with a receipt.',
    pathConfigured: 'Managed PATH policy is recorded in the portable manifest.',
  },
  info: {
    starting: 'Start with bun run mzsh -- audit; bootstrap remains a dry run until --apply.',
    usageExamples: 'Checkout-local usage:',
    packageScripts: 'Managed lifecycle commands:',
    availableTypes: 'Available opening types: default, vim, nano, code, subl',
    shellRefresh: 'Open a new shell after an applied bootstrap.',
  },
  examples: [
    'bun run mzsh -- audit',
    'bun run mzsh -- bootstrap --source /absolute/mzsh-checkout',
    'bun run mzsh -- update --source /absolute/mzsh-checkout',
    'bun run mzsh -- rollback receipt-id',
  ],
  scripts: [
    'bun run mzsh -- audit              # Read-only environment report',
    'bun run mzsh -- bootstrap --source /absolute/mzsh-checkout',
    'bun run mzsh -- rollback receipt-id',
  ],
} as const;
