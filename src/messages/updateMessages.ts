/**
 * Update Messages
 * Centralized messages for update/reinstall functionality
 */

export const updateMessages = {
  // Error messages with actionable guidance
  errors: {
    updateFailed: {
      message: 'Update failed',
      action:
        'Try these solutions:\n  • Check your internet connection\n  • Ensure you have write permissions to installation directory\n  • Try manual reinstallation: bun run uninst && bun run inst\n  • Check if the project repository is accessible',
      code: 'UPDATE_001',
    },
    reinstallFailed: {
      message: 'Reinstallation failed',
      action:
        'Manual reinstallation required:\n  1. Run: bun run uninst\n  2. Wait for completion\n  3. Run: bun run inst\n  4. If issues persist, check installation requirements',
      code: 'UPDATE_002',
    },
    versionCheckFailed: {
      message: 'Failed to check current version',
      action:
        "Version verification failed. Try:\n  • Check if mzsh is properly installed\n  • Verify PATH configuration\n  • Run 'mzsh --help' to test basic functionality",
      code: 'UPDATE_003',
    },
    downloadFailed: {
      message: 'Failed to download updates',
      action:
        'Network or repository issue:\n  • Check internet connectivity\n  • Verify repository access\n  • Try again later if repository is temporarily unavailable\n  • Consider manual installation from source',
      code: 'UPDATE_004',
    },
  },

  // Success messages (minimal)
  success: {
    completed: '🎉 Update completed successfully!',
    reinstallCompleted: '🎉 Reinstallation completed successfully!',
  },

  // Info messages
  info: {
    starting: '🔄 Updating mzsh...',
    reinstalling: '🔄 Reinstalling mzsh...',
    checkingVersion: 'Checking current version...',
    downloadingUpdates: 'Downloading updates...',
    applyingUpdates: 'Applying updates...',
    currentVersion: 'Current version: {version}',
    latestVersion: 'Latest version: {version}',
    alreadyLatest: 'Already running the latest version',
    shellRefresh: 'Starting new shell session to apply changes...',
  },
} as const;
