/**
 * Update Manager Module for zshrc-manager
 *
 * This module handles the complex process of updating and reinstalling the
 * zshrc-manager tool. It implements a sophisticated project detection system
 * and orchestrates the update process through shell scripts.
 *
 * Key features:
 * - Intelligent project root detection across multiple search strategies
 * - Comprehensive error handling with detailed user guidance
 * - Two-phase update process (uninstall → install) for clean updates
 * - Support for various installation scenarios (global, local, development)
 * - Detailed logging and progress feedback throughout the process
 *
 * The module addresses the challenge of updating a globally installed tool
 * when the original project files may be in various locations or missing.
 * It provides extensive troubleshooting guidance for common scenarios.
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

/**
 * UpdateManager - Handles update and reinstallation operations
 *
 * This class manages the complex process of updating zshrc-manager installations.
 * It implements multiple strategies for locating the project files and provides
 * comprehensive error handling for various edge cases.
 *
 * The update process follows a two-phase approach:
 * 1. Clean uninstallation of the current version
 * 2. Fresh installation of the updated version
 *
 * This approach ensures that:
 * - Old files and configurations are properly removed
 * - New features and fixes are cleanly installed
 * - No conflicts arise from partial updates
 * - The installation is in a known good state after completion
 *
 * The class handles various installation scenarios:
 * - Development installations (project directory available)
 * - Global installations (project may be in various locations)
 * - Installations where original project was deleted
 */
export class UpdateManager {
  /**
   * Execute the complete update process
   *
   * This is the main entry point for update operations. It orchestrates
   * the entire update workflow, from project detection through final
   * installation, with comprehensive error handling and user feedback.
   *
   * The update workflow:
   * 1. Display update initiation message
   * 2. Locate the project root directory
   * 3. Execute uninstall script to clean current installation
   * 4. Execute install script to install updated version
   * 5. Report completion status
   *
   * @throws Process exits with code 1 if project cannot be found
   */
  async runUpdate(): Promise<void> {
    // Phase 0: Initialize update process with user feedback
    console.log(chalk.blue('🔄 Starting zshrc-manager update...'));
    console.log('');

    // Phase 1: Project Detection
    // Locate the project root directory using multiple search strategies
    const projectRoot = await this.findProjectRoot();
    if (!projectRoot) {
      // If project cannot be found, show comprehensive error guidance
      this.showProjectNotFoundError();
      process.exit(1);
    }

    // Confirm project location to user
    console.log(chalk.gray(`Project root: ${projectRoot}`));
    console.log('');

    // Phase 2: Clean Uninstallation
    // Remove current installation to prevent conflicts
    console.log(chalk.blue('🗑️  Step 1: Uninstalling current version...'));
    await this.runScript(path.join(projectRoot, 'uninstall.sh'));

    console.log('');

    // Phase 3: Fresh Installation
    // Install the updated version with all latest changes
    console.log(chalk.blue('📦 Step 2: Installing updated version...'));
    await this.runScript(path.join(projectRoot, 'install.sh'));

    // Phase 4: Completion
    console.log('');
    console.log(chalk.green('✅ Update completed successfully!'));
  }

  /**
   * Display comprehensive error guidance when project cannot be found
   *
   * This method provides detailed troubleshooting information for users
   * when the project root cannot be located. It covers the most common
   * scenarios and provides actionable solutions for each case.
   *
   * The error guidance covers:
   * - Scenario analysis (deleted project vs wrong directory)
   * - Step-by-step recovery instructions
   * - Alternative solutions for different situations
   * - System commands to locate existing installations
   * - Explanation of why project files are required
   */
  private showProjectNotFoundError(): void {
    console.error(chalk.red('❌ Error: Could not find zshrc-manager project directory'));
    console.error('');
    console.error(chalk.yellow('This can happen in two scenarios:'));
    console.error('');

    // Scenario 1: Project was deleted after installation
    console.error(chalk.blue('1. You deleted the project folder after installation:'));
    console.error('   • You need to re-download/clone the zshrc-manager project');
    console.error('   • Git clone: git clone <repository-url> zshrc-manager');
    console.error('   • Then navigate to the project: cd zshrc-manager');
    console.error('   • Run the update: mzsh --update');
    console.error('');

    // Scenario 2: User is in wrong directory
    console.error(chalk.blue('2. You are not in the project directory:'));
    console.error('   • Navigate to where you originally downloaded zshrc-manager');
    console.error('   • Look for a folder containing package.json with "zshrc-manager"');
    console.error('   • cd into that directory and run: mzsh --update');
    console.error('');

    // Alternative solutions for power users
    console.error(chalk.blue('Alternative solutions:'));
    console.error('   • Use package manager scripts if in project dir: bun run update');
    console.error('   • Or use: bun run inst (after bun run uninst)');
    console.error('   • Manually uninstall and reinstall: bun unlink && bun link');
    console.error('');

    // System commands to locate existing projects
    console.error(chalk.blue('To find existing project on your system:'));
    console.error(
      '   • Search: find ~ -name "package.json" -exec grep -l "zshrc-manager" {} \\; 2>/dev/null'
    );
    console.error('   • Or: locate package.json | xargs grep -l "zshrc-manager" 2>/dev/null');
    console.error('');

    // Explanation of requirement
    console.error(chalk.gray('The update feature requires access to the original project files.'));
  }

  /**
   * Locate the zshrc-manager project root directory
   *
   * This method implements a comprehensive search strategy to find the
   * project directory containing the update scripts. It uses multiple
   * approaches to handle various installation scenarios.
   *
   * Search strategy (in order of preference):
   * 1. Current working directory and parent directories
   * 2. Command installation location and parent directories
   * 3. Common project locations in user's home directory
   *
   * Each location is validated by checking for a package.json file
   * with the correct project name ("zshrc-manager").
   *
   * @returns Promise<string | null> Path to project root, or null if not found
   */
  private async findProjectRoot(): Promise<string | null> {
    const searchPaths: string[] = [];

    // SEARCH STRATEGY 1: Current Working Directory Tree
    // Start from where the user ran the command and search upward
    // This handles cases where users run the update from within the project
    let currentDir = process.cwd();
    searchPaths.push(`Current directory: ${currentDir}`);

    // Traverse up the directory tree from current working directory
    for (let i = 0; i < 10; i++) {
      // Limit depth to prevent infinite loops
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          // Validate this is actually the zshrc-manager project
          if (packageJson.name === 'zshrc-manager') {
            return currentDir;
          }
        } catch {
          // Continue searching if package.json is invalid or unreadable
        }
      }

      // Move up one directory level
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root, stop searching
        break;
      }
      currentDir = parentDir;
    }

    // SEARCH STRATEGY 2: Command Installation Location Tree
    // Search from where the command binary is installed
    // This handles cases where the command is globally installed
    currentDir = __dirname;
    searchPaths.push(`Command location: ${currentDir}`);

    // Traverse up from the command installation directory
    for (let i = 0; i < 10; i++) {
      // Limit depth to prevent infinite loops
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          // Validate this is the correct project
          if (packageJson.name === 'zshrc-manager') {
            return currentDir;
          }
        } catch {
          // Continue searching if package.json is invalid
        }
      }

      // Move up one directory level
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root, stop searching
        break;
      }
      currentDir = parentDir;
    }

    // SEARCH STRATEGY 3: Common Project Locations
    // Check typical locations where developers store projects
    // This handles cases where the project is in a standard location
    const commonPaths = [
      path.join(os.homedir(), 'zshrc-manager'), // ~/zshrc-manager
      path.join(os.homedir(), 'repos', 'zshrc-manager'), // ~/repos/zshrc-manager
      path.join(os.homedir(), 'projects', 'zshrc-manager'), // ~/projects/zshrc-manager
      path.join(os.homedir(), 'dev', 'zshrc-manager'), // ~/dev/zshrc-manager
      path.join(os.homedir(), 'Downloads', 'zshrc-manager'), // ~/Downloads/zshrc-manager
    ];

    // Check each common location
    for (const commonPath of commonPaths) {
      searchPaths.push(`Common location: ${commonPath}`);
      const packageJsonPath = path.join(commonPath, 'package.json');

      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          // Validate this is the correct project
          if (packageJson.name === 'zshrc-manager') {
            return commonPath;
          }
        } catch {
          // Continue searching if package.json is invalid
        }
      }
    }

    // SEARCH FAILED: Provide debugging information
    // Show user where we looked to help with troubleshooting
    console.error(chalk.gray('Searched in the following locations:'));
    searchPaths.forEach((searchPath) => {
      console.error(chalk.gray(`  • ${searchPath}`));
    });
    console.error('');

    return null; // Project not found
  }

  /**
   * Execute a shell script with proper error handling and process management
   *
   * This method provides a robust way to execute shell scripts as part of
   * the update process. It handles process spawning, stdio inheritance for
   * real-time output, and comprehensive error reporting.
   *
   * Key features:
   * - Inherits stdio for real-time output display to user
   * - Proper working directory management
   * - Comprehensive error handling with descriptive messages
   * - Promise-based interface for async/await compatibility
   *
   * @param scriptPath Full path to the shell script to execute
   * @returns Promise that resolves on success, rejects on failure
   * @throws Error with descriptive message if script fails or cannot be run
   */
  private async runScript(scriptPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Spawn bash process to execute the script
      const child = spawn('bash', [scriptPath], {
        stdio: 'inherit', // Inherit stdio for real-time output
        cwd: path.dirname(scriptPath), // Set working directory to script location
      });

      // Handle process completion
      child.on('close', (code) => {
        if (code === 0) {
          // Script executed successfully
          resolve();
        } else {
          // Script failed with non-zero exit code
          reject(new Error(`Script ${scriptPath} exited with code ${code}`));
        }
      });

      // Handle process spawn errors
      child.on('error', (error) => {
        // Failed to start the process (e.g., bash not found, permission denied)
        reject(new Error(`Failed to run script ${scriptPath}: ${error.message}`));
      });
    });
  }
}
