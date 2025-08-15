/**
 * Main entry point for the mzsh CLI application.
 *
 * This file serves as the orchestrator for the entire application, coordinating
 * between different modules to provide a cohesive user experience. It handles:
 * - Command-line argument parsing (both OCLIF and standalone modes)
 * - Flag validation and processing
 * - Routing to appropriate functionality (file management vs updates)
 * - Error handling and user feedback
 *
 * The class extends OCLIF's Command class but also supports standalone execution
 * for maximum compatibility across different installation methods.
 */

import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { FileDiscovery } from './fileDiscovery';
import { InteractiveMenu } from './interactiveMenu';
import { appMessages, formatMessage } from './messages';
import { type OpenType, getAvailableOpenTypes, getOpenConfig, isValidOpenType } from './openConfig';
import { SelfUninstaller } from './selfUninstaller';
import { UpdateManager } from './updateManager';

/**
 * ZshrcManager - Main command class for the mzsh CLI tool
 *
 * This class serves as the primary entry point and orchestrator for all functionality.
 * It handles command-line parsing, flag validation, and delegates specific tasks
 * to specialized modules for clean separation of concerns.
 *
 * Key responsibilities:
 * - Parse and validate command-line arguments and flags
 * - Handle both OCLIF framework and standalone execution modes
 * - Route requests to appropriate handlers (update vs file management)
 * - Provide comprehensive help and usage information
 * - Manage error handling and user feedback
 */
export default class ZshrcManager extends Command {
  /** Human-readable description shown in help output */
  static override description = 'Interactive zsh configuration file manager';

  /** Example usage patterns displayed in help documentation */
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o vim',
    '<%= config.bin %> <%= command.id %> --open-type code',
    '<%= config.bin %> <%= command.id %> --update',
    '<%= config.bin %> <%= command.id %> --reinstall',
    '<%= config.bin %> <%= command.id %> --uninst',
  ];

  /**
   * Command-line flags configuration
   * Defines all available options with their types, descriptions, and validation
   */
  static override flags = {
    'open-type': Flags.string({
      char: 'o', // Short flag: -o
      description: `How to open the selected file. Options: ${getAvailableOpenTypes().join(', ')}`,
      default: 'default',
      options: getAvailableOpenTypes(), // Validates against available editor types
    }),
    update: Flags.boolean({
      description: 'Update zshrc-manager to the latest version',
    }),
    reinstall: Flags.boolean({
      description: 'Reinstall zshrc-manager (same as --update)',
    }),
    uninst: Flags.boolean({
      description: 'Uninstall mzsh from the system',
    }),
  };

  /**
   * Dependency injection: Specialized modules for different responsibilities
   * This promotes loose coupling and makes the code more testable and maintainable
   */
  private fileDiscovery = new FileDiscovery(); // Handles finding zsh config files
  private interactiveMenu = new InteractiveMenu(); // Manages user interaction and file selection
  private selfUninstaller = new SelfUninstaller(); // Handles self-uninstallation
  private updateManager = new UpdateManager(); // Handles update/reinstall operations

  /**
   * Main execution method - orchestrates the entire application flow
   *
   * This method handles two distinct execution modes:
   * 1. OCLIF mode: When running with full OCLIF framework support
   * 2. Standalone mode: When running as a standalone executable
   *
   * The method follows this flow:
   * 1. Parse command-line arguments (mode-dependent)
   * 2. Validate flags and handle special cases (help, update)
   * 3. Route to appropriate functionality:
   *    - Update/reinstall operations → UpdateManager
   *    - File management → FileDiscovery + InteractiveMenu
   * 4. Handle errors gracefully with user-friendly messages
   */
  override async run(): Promise<void> {
    try {
      // Initialize default values for command processing
      let openType: OpenType = 'default';
      let shouldUpdate = false;
      let shouldUninstall = false;

      // Dual-mode argument parsing: OCLIF vs Standalone
      if (this.config && typeof this.config.runHook === 'function') {
        // OCLIF MODE: Full framework available with automatic parsing
        // This provides rich flag validation, help generation, and error handling
        const { flags } = await this.parse(ZshrcManager);
        openType = flags['open-type'] as OpenType;
        shouldUpdate = flags.update || flags.reinstall;
        shouldUninstall = flags.uninst;
      } else {
        // STANDALONE MODE: Manual argument parsing for maximum compatibility
        // This allows the tool to work even when OCLIF framework isn't fully loaded
        const args = this.argv || process.argv.slice(2);

        // Check for update operations first (they don't require file discovery)
        shouldUpdate = args.includes('--update') || args.includes('--reinstall');

        // Check for uninstall operation
        shouldUninstall = args.includes('--uninst');

        // Handle help requests manually in standalone mode
        if (args.includes('--help') || args.includes('-h')) {
          this.showHelp();
          return;
        }

        // Parse open-type flag manually with validation
        const openTypeIndex = args.findIndex((arg) => arg === '-o' || arg === '--open-type');
        if (openTypeIndex !== -1 && args[openTypeIndex + 1]) {
          const providedType = args[openTypeIndex + 1];
          if (providedType && isValidOpenType(providedType)) {
            openType = providedType;
          } else {
            // Use centralized error message
            console.error(
              formatMessage.error(
                appMessages.errors.invalidOpenType.message,
                appMessages.errors.invalidOpenType.action,
                appMessages.errors.invalidOpenType.code
              )
            );
            process.exit(1);
          }
        }
      }

      // ROUTING: Determine which functionality to execute

      // Route 1: Uninstall Operations
      if (shouldUninstall) {
        await this.selfUninstaller.runUninstall();
        return;
      }

      // Route 2: Update/Reinstall Operations
      if (shouldUpdate) {
        await this.updateManager.runUpdate();
        return;
      }

      // Route 3: File Management Operations

      // Step 1: Discover available zsh configuration files
      const files = await this.fileDiscovery.discoverZshFiles();

      // Handle case where no configuration files are found
      if (files.length === 0) {
        console.error(
          formatMessage.error(
            appMessages.errors.noConfigFiles.message,
            appMessages.errors.noConfigFiles.action,
            appMessages.errors.noConfigFiles.code
          )
        );
        return;
      }

      // Step 2: Inform user about the opening method that will be used
      const config = getOpenConfig(openType);
      console.log(chalk.gray(`Opening method: ${config.name} - ${config.description}`));
      console.log('');

      // Step 3: Present interactive menu and handle file selection
      await this.interactiveMenu.showInteractiveMenu(files, openType);
    } catch (error) {
      // Centralized error handling with user-friendly messages
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }

  /**
   * Display comprehensive help information for standalone mode
   *
   * This method provides detailed usage information when the full OCLIF
   * help system isn't available. It mirrors the information that would
   * be automatically generated by OCLIF but in a manually crafted format.
   *
   * The help includes:
   * - Application description
   * - Usage syntax
   * - All available options with descriptions
   * - Practical examples for common use cases
   */
  private showHelp(): void {
    console.log(appMessages.help.description);
    console.log('');
    console.log('USAGE');
    console.log(`  ${appMessages.help.usage}`);
    console.log('');
    console.log('OPTIONS');
    console.log(`  ${appMessages.help.options.openType}`);
    console.log(`                          Options: ${getAvailableOpenTypes().join(', ')}`);
    console.log(`      ${appMessages.help.options.update}`);
    console.log(`      ${appMessages.help.options.reinstall}`);
    console.log(`      ${appMessages.help.options.uninst}`);
    console.log(`  ${appMessages.help.options.help}`);
    console.log('');
    console.log('EXAMPLES');
    appMessages.help.examples.forEach((example) => {
      console.log(`  ${example}`);
    });
  }
}
