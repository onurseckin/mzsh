export const uninstallMessages = {
  errors: {
    stillFound: {
      message: 'Legacy global uninstall is retired',
      action:
        'Recover only through a recorded transaction:\n  • bun run mzsh -- rollback receipt-id\n  • bun run mzsh -- rollback receipt-id --apply\n  • retain protected backups until the receipt is unavailable',
      code: 'UNINSTALL_001',
    },
    receiptUnavailable: {
      message: 'Managed rollback receipt is unavailable',
      action:
        'Run a dry audit, select an available receipt, and apply rollback only after reviewing its protected backup state.',
      code: 'UNINSTALL_002',
    },
    permissionDenied: {
      message: 'Managed rollback requires owner-controlled state',
      action:
        'Do not use elevated deletion. Restore owner-only permissions on the managed state directory and rerun rollback dry-run.',
      code: 'UNINSTALL_003',
    },
  },
  success: {
    completed: 'Managed rollback completed.',
    transactionRestored: 'The selected managed transaction has been restored.',
  },
  info: {
    starting: 'Planning managed rollback...',
    pathPreserved: 'Rollback restores recorded files without global package deletion.',
    shellRefresh: 'Open a new shell after an applied rollback.',
    refreshingEnvironment: 'Managed rollback does not source live shell files.',
  },
  summary: {
    title: 'Managed rollback summary:',
    items: {
      receipt: 'Receipt: reviewed',
      backups: 'Protected backups: verified',
      verification: 'Managed target verification: passed',
    },
  },
} as const;
