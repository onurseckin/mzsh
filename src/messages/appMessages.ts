/**
 * Application Messages
 * Centralized messages for main application functionality
 */

export const appMessages = {
  // Error messages with actionable guidance
  errors: {
    invalidOpenType: {
      message: 'Invalid open type provided',
      action:
        'Use one of the supported open types:\n  • default (system default)\n  • vim (Vim editor)\n  • nano (Nano editor)\n  • code (VS Code)\n  • subl (Sublime Text)\n\nExample: mzsh -o vim',
      code: 'APP_001',
    },
    noConfigFiles: {
      message: 'No zsh configuration files found',
      action:
        'Create a zsh configuration file:\n  • touch ~/.zshrc (for zsh)\n  • touch ~/.bashrc (for bash)\n  • Or check if your shell configuration files exist in expected locations',
      code: 'APP_002',
    },
    fileDiscoveryFailed: {
      message: 'Failed to discover configuration files',
      action:
        "Check file system permissions and try:\n  • Ensure you have read access to your home directory\n  • Verify shell configuration files aren't corrupted\n  • Check if your shell is properly configured",
      code: 'APP_003',
    },
    menuInteractionFailed: {
      message: 'Interactive menu failed',
      action:
        'Try alternative approaches:\n  • Use direct file path instead of interactive menu\n  • Check terminal compatibility\n  • Ensure your terminal supports interactive input',
      code: 'APP_004',
    },
  },

  // Success messages (minimal)
  success: {
    fileOpened: 'Configuration file opened successfully',
  },

  // Info messages
  info: {
    openingMethod: 'Opening method: {method} - {description}',
    availableFiles: 'Found {count} configuration file(s)',
    selectFile: 'Select a configuration file to open:',
  },

  // Help content
  help: {
    description: 'Interactive zsh configuration file manager',
    usage: 'mzsh [OPTIONS]',
    options: {
      openType: '-o, --open-type <type>  How to open the selected file',
      update: '--update            Update mzsh to the latest version',
      reinstall: '--reinstall         Reinstall mzsh (same as --update)',
      uninst: '--uninst            Uninstall mzsh from the system',
      help: '-h, --help              Show help',
    },
    examples: [
      'mzsh                    # Use default application',
      'mzsh -o vim            # Open with vim',
      'mzsh --open-type code  # Open with VS Code',
      'mzsh --update          # Update mzsh',
      'mzsh --reinstall       # Reinstall mzsh',
      'mzsh --uninst          # Uninstall mzsh',
    ],
  },
} as const;
