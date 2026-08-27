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
import { runMzshCli } from './cli/run-cli';
import type { RunMzshCliDependencies } from './cli/run-cli';
import { catalog, renderCatalogUsage } from './catalog/command-catalog';
import { createCommanderAdapter } from './catalog/commander-adapter';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { AuthLeaseService } from './application/auth-lease';
import { EnvironmentService } from './application/environment-service';
import { RedactionService } from './application/redaction-service';
import type { OperatingSystemAuthorization } from './domain/auth';
import { gatewayRedactionRegistry } from './infrastructure/gateway-redaction-registry';
import { OwnerOnlyAuthLeaseStore } from './infrastructure/owner-only-auth-lease-store';
import {
  OwnerOnlyPrivateEnvironment,
  type OpenPrivateBoundary,
} from './infrastructure/owner-only-private-environment';
import { OsAuth } from './infrastructure/os-auth';
import { openPrivateBoundary } from './infrastructure/open-private-boundary';

export { renderZshCompletion } from './catalog/completion';

export function managedRepositoryRoot(moduleDirectory: string): string {
  return resolve(moduleDirectory, '..');
}

export function isManagedCliRoute(args: readonly string[]): boolean {
  return (
    catalog.has(args[0] ?? '') ||
    args.some((arg) => ['--update', '--reinstall', '--uninst'].includes(arg))
  );
}

export const checkoutLocalCommandLines = catalog.commands
  .filter((command) => command.available)
  .map((command) => `  bun run mzsh -- ${renderCatalogUsage(command.name, 'checkout')}`);

export interface ManagedCliDependenciesInput {
  readonly home: string;
  readonly xdgConfig: string;
  readonly xdgCache: string;
  readonly repositoryRoot: string;
  readonly write: (message: string) => void;
  readonly authorization?: OperatingSystemAuthorization;
  readonly owner?: () => string;
  readonly openPrivateBoundary?: OpenPrivateBoundary;
}

export function createManagedCliDependencies(
  input: ManagedCliDependenciesInput
): RunMzshCliDependencies {
  const managedRoot = join(input.xdgConfig, 'mzsh');
  return {
    home: input.home,
    xdgConfig: input.xdgConfig,
    xdgCache: input.xdgCache,
    repositoryRoot: input.repositoryRoot,
    write: input.write,
    environment: new EnvironmentService(
      new OwnerOnlyPrivateEnvironment(
        join(managedRoot, 'private.zsh'),
        input.openPrivateBoundary ?? openPrivateBoundary
      ),
      new RedactionService(gatewayRedactionRegistry)
    ),
    authLease: new AuthLeaseService({
      authorization: input.authorization ?? new OsAuth(),
      store: new OwnerOnlyAuthLeaseStore(join(managedRoot, 'auth-lease.json')),
      owner: input.owner ?? (() => String(process.getuid?.() ?? 'unknown')),
    }),
  };
}

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

  static override examples = catalog.commands
    .filter((command) => command.available)
    .map((command) => `bun run mzsh -- ${renderCatalogUsage(command.name, 'checkout')}`);

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
  };

  /**
   * Dependency injection: Specialized modules for different responsibilities
   * This promotes loose coupling and makes the code more testable and maintainable
   */
  private fileDiscovery = new FileDiscovery(); // Handles finding zsh config files
  private interactiveMenu = new InteractiveMenu(); // Manages user interaction and file selection

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
   * 3. Route to a managed command or the file-discovery menu.
   * 4. Handle errors gracefully with user-friendly messages
   */
  override async run(): Promise<void> {
    try {
      const managedArgs = this.argv || process.argv.slice(2);
      if (isManagedCliRoute(managedArgs)) {
        process.exitCode = runMzshCli(
          managedArgs,
          createManagedCliDependencies({
            home: process.env.HOME ?? '/',
            xdgConfig: process.env.XDG_CONFIG_HOME ?? `${process.env.HOME ?? '/'}/.config`,
            xdgCache: process.env.XDG_CACHE_HOME ?? `${process.env.HOME ?? '/'}/.cache`,
            repositoryRoot: managedRepositoryRoot(__dirname),
            write: (message) => console.log(message),
          })
        );
        return;
      }
      // Initialize default values for command processing
      let openType: OpenType = 'default';

      // Dual-mode argument parsing: OCLIF vs Standalone
      if (this.config && typeof this.config.runHook === 'function') {
        // OCLIF MODE: Full framework available with automatic parsing
        // This provides rich flag validation, help generation, and error handling
        const { flags } = await this.parse(ZshrcManager);
        openType = flags['open-type'] as OpenType;
      } else {
        // STANDALONE MODE: Manual argument parsing for maximum compatibility
        // This allows the tool to work even when OCLIF framework isn't fully loaded
        const args = this.argv || process.argv.slice(2);

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

      // Route: File Management Operations

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
    console.log(createCommanderAdapter().help());
    console.log('');
    console.log('OPTIONS');
    console.log(`  ${appMessages.help.options.openType}`);
    console.log(`                          Options: ${getAvailableOpenTypes().join(', ')}`);
    console.log(`  ${appMessages.help.options.help}`);
    console.log('');
    console.log('EXAMPLES');
    for (const line of checkoutLocalCommandLines.slice(4)) console.log(line);
  }
}
