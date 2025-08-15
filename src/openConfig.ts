/**
 * Open Configuration Module for zshrc-manager
 *
 * This module provides a flexible system for opening files with different
 * applications and editors. It abstracts the complexity of cross-platform
 * file opening and provides a unified interface for various editor types.
 *
 * Key features:
 * - Cross-platform support (macOS, Windows, Linux)
 * - Multiple editor types (terminal-based and GUI applications)
 * - Configurable behavior (blocking vs non-blocking execution)
 * - Comprehensive error handling with user-friendly messages
 * - Type-safe configuration system
 *
 * The module supports both terminal-based editors (vim, nano) that require
 * the process to wait for completion, and GUI applications (VS Code, Sublime)
 * that can run independently without blocking the parent process.
 */

import { ChildProcess, spawn } from 'child_process';

/**
 * Supported file opening methods
 *
 * Each type represents a different way to open files, with specific
 * behavior and requirements:
 * - default: Uses system default application (cross-platform)
 * - vim: Terminal-based editor with modal interface
 * - nano: Simple terminal editor with straightforward interface
 * - code: Visual Studio Code (GUI application)
 * - subl: Sublime Text (GUI application)
 */
export type OpenType = 'default' | 'vim' | 'nano' | 'code' | 'subl';

/**
 * Result structure for command generation functions
 *
 * This interface defines the structure returned by command generation
 * functions, providing both the command to execute and its arguments.
 */
export interface CommandResult {
  /** The command to execute (must be available in PATH) */
  command: string;

  /** Array of command-line arguments */
  args: string[];
}

/**
 * Default command function implementation for cross-platform file opening
 *
 * This function generates the appropriate system command for opening files
 * with the default application, handling platform differences automatically.
 *
 * Platform support:
 * - macOS: Uses 'open' command
 * - Windows: Uses 'start' command
 * - Linux/Unix: Uses 'xdg-open' command
 *
 * @param filePath Path to the file to open
 * @returns CommandResult with platform-appropriate command and arguments
 */
const createDefaultCommand = (filePath: string): CommandResult => {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  return { command, args: [filePath] };
};

/**
 * Configuration interface for file opening methods
 *
 * This interface defines the complete configuration structure for each
 * supported file opening method, including display information, command
 * details, and process management options.
 */
export interface OpenConfig {
  /** Human-readable name for display in menus and messages */
  name: string;

  /** Detailed description explaining the opening method's behavior */
  description: string;

  /** Command to execute - can be a string or function for dynamic commands */
  command: string | typeof createDefaultCommand;

  /** Process spawning options for child_process.spawn() */
  options: {
    /** Whether to detach the process from the parent */
    detached: boolean;

    /** How to handle stdio streams */
    stdio: 'inherit' | 'ignore';

    /** Whether to run the command through a shell */
    shell?: boolean;
  };

  /** Whether to wait for the application to exit before continuing */
  waitForExit: boolean;
}

/**
 * Configuration mapping for all supported opening methods
 *
 * This record defines the specific configuration for each supported
 * file opening type, including platform-specific commands, process
 * management options, and behavioral settings.
 *
 * The configurations are divided into two categories:
 * 1. Terminal-based editors (vim, nano): Block execution, inherit stdio
 * 2. GUI applications (default, code, subl): Run detached, ignore stdio
 */
export const openConfigs: Record<OpenType, OpenConfig> = {
  default: {
    name: 'Default Application',
    description: 'Opens with system default application (separate window)',
    command: createDefaultCommand, // Dynamic command based on platform
    options: {
      detached: true, // Run independently of parent process
      stdio: 'ignore', // Don't inherit stdio streams
    },
    waitForExit: false, // Don't wait for application to close
  },
  vim: {
    name: 'Vim',
    description: 'Opens in Vim editor (terminal-based)',
    command: 'vim',
    options: {
      detached: false, // Keep attached to parent process
      stdio: 'inherit', // Inherit stdio for user interaction
      shell: true, // Run through shell for proper terminal handling
    },
    waitForExit: true, // Wait for user to exit editor
  },
  nano: {
    name: 'Nano',
    description: 'Opens in Nano editor (terminal-based)',
    command: 'nano',
    options: {
      detached: false, // Keep attached to parent process
      stdio: 'inherit', // Inherit stdio for user interaction
      shell: true, // Run through shell for proper terminal handling
    },
    waitForExit: true, // Wait for user to exit editor
  },
  code: {
    name: 'VS Code',
    description: 'Opens in Visual Studio Code (separate window)',
    command: 'code',
    options: {
      detached: true, // Run independently of parent process
      stdio: 'ignore', // Don't inherit stdio streams
    },
    waitForExit: false, // Don't wait for application to close
  },
  subl: {
    name: 'Sublime Text',
    description: 'Opens in Sublime Text (separate window)',
    command: 'subl',
    options: {
      detached: true, // Run independently of parent process
      stdio: 'ignore', // Don't inherit stdio streams
    },
    waitForExit: false, // Don't wait for application to close
  },
};

/**
 * Get list of all available opening types
 *
 * This function returns an array of all supported OpenType values,
 * useful for validation, UI generation, and help text creation.
 *
 * @returns Array of all supported opening types
 */
export function getAvailableOpenTypes(): OpenType[] {
  return Object.keys(openConfigs) as OpenType[];
}

/**
 * Get configuration for a specific opening type
 *
 * This function retrieves the complete configuration object for
 * a given opening type, providing access to all settings needed
 * for launching the application.
 *
 * @param type The opening type to get configuration for
 * @returns Configuration object for the specified type
 */
export function getOpenConfig(type: OpenType): OpenConfig {
  return openConfigs[type];
}

/**
 * Type guard to validate opening type strings
 *
 * This function checks if a given string is a valid OpenType,
 * providing type safety for user input validation and preventing
 * runtime errors from invalid type specifications.
 *
 * @param type String to validate as an OpenType
 * @returns True if the string is a valid OpenType, false otherwise
 */
export function isValidOpenType(type: string): type is OpenType {
  return type in openConfigs;
}

/**
 * Open a file using the specified opening method
 *
 * This is the main function for opening files with different applications.
 * It handles the complexity of process spawning, cross-platform differences,
 * and provides comprehensive error handling through callback functions.
 *
 * The function supports two execution modes:
 * 1. Blocking (waitForExit: true): Waits for the application to close
 * 2. Non-blocking (waitForExit: false): Launches app and continues immediately
 *
 * Process management details:
 * - Terminal editors: Inherit stdio for user interaction, wait for completion
 * - GUI applications: Detach process and run independently, don't wait
 * - Error handling: Comprehensive error reporting with helpful messages
 * - Cross-platform: Handles platform-specific commands automatically
 *
 * @param filePath Full path to the file to open
 * @param openType Method to use for opening the file
 * @param onSuccess Optional callback for successful operations
 * @param onError Optional callback for error handling
 * @returns Promise that resolves when operation completes (or starts for non-blocking)
 */
export function openFileWithType(
  filePath: string,
  openType: OpenType,
  onSuccess?: Function,
  onError?: Function
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get configuration for the specified opening type
    const config = getOpenConfig(openType);

    // Prepare command and arguments
    let command: string;
    let args: string[];

    if (typeof config.command === 'function') {
      // Dynamic command generation (e.g., for cross-platform default command)
      const result = config.command(filePath);
      command = result.command;
      args = result.args;
    } else {
      // Static command with file path as argument
      command = config.command;
      args = [filePath];
    }

    // Spawn the application process with the configured options
    const child: ChildProcess = spawn(command, args, config.options);

    // For detached processes, unref to allow parent to exit independently
    if (config.options.detached) {
      child.unref();
    }

    // Handle process spawn errors (e.g., command not found, permission denied)
    child.on('error', (error) => {
      const errorMsg = `Failed to open with ${config.name}: ${error.message}`;
      if (onError) {
        onError(errorMsg);
      }
      reject(new Error(errorMsg));
    });

    if (config.waitForExit) {
      // BLOCKING MODE: Wait for terminal editors to complete
      // This is necessary for editors like vim and nano where the user
      // needs to interact with the application before it exits
      child.on('exit', (code) => {
        if (code === 0) {
          // Successful completion
          const successMsg = `File editing completed with ${config.name}.`;
          if (onSuccess) {
            onSuccess(successMsg);
          }
          resolve();
        } else {
          // Application exited with error code
          const errorMsg = `${config.name} exited with code ${code}`;
          if (onError) {
            onError(errorMsg);
          }
          reject(new Error(errorMsg));
        }
      });
    } else {
      // NON-BLOCKING MODE: Launch GUI applications independently
      // These applications should run in the background without blocking
      // the parent process, so we immediately report success
      const successMsg = `File opened with ${config.name}.`;
      if (onSuccess) {
        onSuccess(successMsg);
      }
      resolve();
    }
  });
}
