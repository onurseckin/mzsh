/**
 * Uninstallation Messages
 * Centralized messages for uninstallation process
 */

export const uninstallMessages = {
  // Error messages with actionable guidance
  errors: {
    stillFound: {
      message: 'Uninstallation failed - mzsh still found',
      action:
        'Manual removal required. Try these commands:\n  • sudo rm -f [PATH_TO_MZSH]\n  • Check for multiple installations in different locations\n  • Verify you have sufficient permissions',
      code: 'UNINSTALL_001',
    },
    npmRemovalFailed: {
      message: 'Failed to remove npm global installation',
      action:
        'Remove manually with elevated permissions:\n  • sudo npm uninstall -g mzsh\n  • Or check npm global directory permissions',
      code: 'UNINSTALL_002',
    },
    permissionDenied: {
      message: 'Permission denied during uninstallation',
      action:
        'Some files require elevated permissions:\n  • Try running with sudo for system-wide installations\n  • Check file ownership and permissions\n  • Ensure you have write access to installation directories',
      code: 'UNINSTALL_003',
    },
  },

  // Success messages (minimal)
  success: {
    completed: '🎉 mzsh uninstallation completed!',
    systemClean: 'mzsh has been successfully uninstalled from your system!',
  },

  // Info messages
  info: {
    starting: '🗑️  Uninstalling mzsh...',
    pathPreserved: 'Your bun PATH configuration has been preserved for other packages',
    shellRefresh: 'Starting new shell session to apply changes...',
    refreshingEnvironment: 'Refreshing environment to apply removal...',
    systemRemoved: 'mzsh has been completely removed from your system',
  },

  // Summary structure
  summary: {
    title: 'Uninstallation Summary:',
    items: {
      bunLink: 'Bun link: Removed',
      npmGlobal: 'npm global: Checked and removed if found',
      binaryFiles: 'Binary files: {count} removed',
      packageDirs: 'Package directories: {count} removed',
      installerComments: 'mzsh installer comments: {count} cleaned',
      bunPath: 'bun PATH configuration: Preserved',
      verification: 'Command verification: Passed',
    },
  },
} as const;
