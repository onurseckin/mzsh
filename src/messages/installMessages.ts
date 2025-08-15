/**
 * Installation Messages
 * Centralized messages for installation process
 */

export const installMessages = {
  // Error messages with actionable guidance
  errors: {
    packageJsonNotFound: {
      message: 'package.json not found',
      action:
        'This script must be run from the mzsh project directory. Navigate to the project root and try again.',
      code: 'INSTALL_001',
    },
    notMzshProject: {
      message: "This doesn't appear to be the mzsh project directory",
      action:
        "Ensure you're in the correct mzsh project directory and package.json contains 'mzsh'.",
      code: 'INSTALL_002',
    },
    bunNotInstalled: {
      message: 'Bun is not installed',
      action:
        'Install Bun first by visiting https://bun.sh and following the installation instructions.',
      code: 'INSTALL_003',
    },
    buildFailed: {
      message: 'Build failed',
      action:
        "Check the build output above for specific errors. Common fixes:\n  • Run 'bun install' to ensure dependencies are installed\n  • Check for TypeScript compilation errors\n  • Ensure all source files are valid",
      code: 'INSTALL_004',
    },
    globalInstallFailed: {
      message: 'Global installation failed',
      action:
        "Try these solutions:\n  • Run 'bun unlink' first to clean previous installations\n  • Check if you have write permissions to global directories\n  • Try running with elevated permissions if necessary",
      code: 'INSTALL_005',
    },
    binaryNotFound: {
      message: 'Installation failed - mzsh binary not found',
      action:
        "The installation completed but the binary wasn't created. Try:\n  • Re-running the installation: bun run inst\n  • Checking if the build step completed successfully\n  • Manually checking if ~/.bun/bin/mzsh exists",
      code: 'INSTALL_006',
    },
    commandNotAccessible: {
      message: 'Installation failed - mzsh command not accessible',
      action:
        "The binary exists but isn't accessible. Try:\n  • Adding ~/.bun/bin to your PATH\n  • Running 'source ~/.zshrc' (or your shell's config file)\n  • Opening a new terminal window",
      code: 'INSTALL_007',
    },
  },

  // Success messages (minimal)
  success: {
    completed: '🎉 mzsh installation completed successfully!',
    pathConfigured: 'PATH configured automatically',
  },

  // Info messages
  info: {
    starting: '🚀 Installing mzsh globally...',
    usageExamples: 'Usage examples:',
    packageScripts: 'Package manager scripts:',
    availableTypes: 'Available opening types: default, vim, nano, code, subl',
    shellRefresh: 'Starting new shell session to apply changes...',
  },

  // Usage examples
  examples: [
    'mzsh                     # Use default application',
    'mzsh -o vim             # Open with vim',
    'mzsh -o nano            # Open with nano',
    'mzsh -o code            # Open with VS Code',
    'mzsh --open-type subl   # Open with Sublime Text',
    'mzsh --update           # Update mzsh',
    'mzsh --reinstall        # Reinstall mzsh',
  ],

  // Package manager scripts
  scripts: [
    'bun run inst            # Install globally',
    'bun run uninst          # Uninstall globally',
    'bun run update          # Update installation',
  ],
} as const;
