import { catalog, renderCatalogUsage } from '../catalog/command-catalog';

const managedExamples = catalog.commands
  .filter((command) => command.available)
  .map((command) => `bun run mzsh -- ${renderCatalogUsage(command.name, 'checkout')}`);

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
      message: 'No managed or legacy zsh configuration files found',
      action:
        'Start with a read-only audit:\n  • bun run mzsh -- audit\n  • bun run mzsh -- bootstrap --source /absolute/mzsh-checkout\n  • Re-run the menu after the dry-run plan is reviewed',
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
    description: 'Managed Zsh configuration migration and inspection tool',
    usage: 'bun run mzsh -- <command> [OPTIONS]',
    options: {
      openType: '-o, --open-type <type>  Open a managed or legacy migration-context file',
      update: `bun run mzsh -- ${renderCatalogUsage('update', 'checkout')}  ${catalog.require('update').summary}`,
      bootstrap: `bun run mzsh -- ${renderCatalogUsage('bootstrap', 'checkout')}  ${catalog.require('bootstrap').summary}`,
      rollback: `bun run mzsh -- ${renderCatalogUsage('rollback', 'checkout')}  ${catalog.require('rollback').summary}`,
      help: '-h, --help              Show help',
    },
    examples: managedExamples,
  },
} as const;
