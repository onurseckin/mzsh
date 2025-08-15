/**
 * Interactive Menu Module for zshrc-manager
 *
 * This module provides a rich, user-friendly interface for selecting and opening
 * zsh configuration files. It leverages the inquirer.js library to create an
 * interactive command-line menu with visual enhancements and intuitive navigation.
 *
 * Key features:
 * - Colorized file listings with visual indicators
 * - Keyboard navigation support (arrow keys, enter, etc.)
 * - Differentiated styling for main .zshrc vs supplementary files
 * - Responsive page sizing based on available files
 * - Comprehensive error handling with helpful user guidance
 * - Integration with the file opening system
 *
 * The module focuses on providing an excellent user experience while maintaining
 * clean separation from business logic through well-defined interfaces.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import * as path from 'path';
import { ZshFile } from './fileDiscovery';
import { type OpenType, openFileWithType } from './openConfig';

// Custom prompt class that handles escape and backspace keys
class CustomListPrompt extends inquirer.prompts.list {
  constructor(questions: any, rl: any, answers: any) {
    super(questions, rl, answers);

    // Override key handling
    this.onKeypress = this.onKeypress.bind(this);
  }

  onKeypress(keypress: any) {
    // Handle escape key (ESC) or backspace
    if (keypress.key && (keypress.key.name === 'escape' || keypress.key.name === 'backspace')) {
      this.status = 'answered';
      this.answer = '__quit__';
      this.done(this.answer);
      return;
    }

    // Handle 'q' key for quit
    if (keypress.key && keypress.key.name === 'q') {
      this.status = 'answered';
      this.answer = '__quit__';
      this.done(this.answer);
      return;
    }

    // Call parent method for other keys
    super.onKeypress(keypress);
  }
}

// Register the custom prompt
inquirer.registerPrompt('custom-list', CustomListPrompt);

/**
 * InteractiveMenu - Manages user interaction for file selection and opening
 *
 * This class provides a sophisticated interactive interface that allows users
 * to browse and select from available zsh configuration files. It handles the
 * presentation layer of the application, focusing on user experience and
 * visual appeal while delegating file operations to appropriate modules.
 *
 * Design principles:
 * - Visual clarity: Uses colors and symbols to enhance readability
 * - Accessibility: Provides clear navigation and feedback
 * - Responsiveness: Adapts to different numbers of files
 * - Error resilience: Handles failures gracefully with helpful messages
 *
 * The class integrates with:
 * - FileDiscovery: Receives file metadata for display
 * - OpenConfig: Delegates file opening operations
 * - Inquirer.js: Provides the interactive selection interface
 */
export class InteractiveMenu {
  /**
   * Display interactive menu and handle file selection
   *
   * This is the main entry point for the interactive file selection process.
   * It creates a visually appealing menu using inquirer.js, handles user
   * selection, and coordinates with the file opening system.
   *
   * @param files Array of discovered zsh files with metadata
   * @param openType The method to use for opening the selected file
   *
   * The process flow:
   * 1. Transform file data into menu choices with formatting
   * 2. Configure and display the interactive selection menu
   * 3. Process user selection and initiate file opening
   * 4. Handle any errors that occur during the process
   */
  async showInteractiveMenu(files: ZshFile[], openType: OpenType): Promise<void> {
    // Transform file metadata into inquirer-compatible choice objects
    // Each choice includes formatted display name, file path value, and short name
    const choices = files.map((file) => ({
      name: this.formatFileNameForMenu(file), // Colorized display name
      value: file.path, // Full path for file operations
      short: file.name, // Brief name for confirmation display
    }));

    // Add quit option at the end
    choices.push({
      name: chalk.red('✕ Quit'),
      value: '__quit__',
      short: 'Quit',
    });

    try {
      // Configure and display the interactive selection menu with custom key handling
      const { selectedFile } = await inquirer.prompt({
        type: 'custom-list', // Custom list with escape/backspace/q key handling
        name: 'selectedFile', // Property name for the result
        message: chalk.cyan('Available zsh configuration files (ESC/Backspace/q to quit):'), // Updated prompt
        choices, // Menu options with formatting
        pageSize: Math.min(files.length + 3, 15), // Responsive sizing (max 15 items, +1 for quit option)
        loop: false, // Disable wrapping at list ends
        // Custom theme for green highlighting of selected items
        theme: {
          style: {
            answer: chalk.green,
            message: chalk.cyan,
            error: chalk.red,
            defaultAnswer: chalk.dim,
            help: chalk.dim,
            highlight: chalk.green.bold, // Green highlighting for currently selected item
            key: chalk.cyan.bold,
          },
        },
      });

      // Handle quit selection
      if (selectedFile === '__quit__') {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
      }

      // Process the user's selection by opening the chosen file
      await this.openFile(selectedFile, openType);
    } catch (error: any) {
      // Handle user interruption (Ctrl+C, ESC, etc.)
      if (error.name === 'ExitPromptError' || error.isTTYError) {
        console.log(chalk.yellow('\nOperation cancelled.'));
        return;
      }
      throw error;
    }
  }

  /**
   * Format file names for display in the interactive menu
   *
   * This method applies visual styling to file names to create an appealing
   * and informative menu display. It uses different colors and indicators
   * to help users quickly identify file types and importance.
   *
   * @param file File metadata including name and type information
   * @returns Formatted string with colors and visual indicators
   *
   * Visual design:
   * - Arrow indicator (→) for all items to show they're selectable
   * - Green bold text for main .zshrc file (highest importance)
   * - Blue text for supplementary files (secondary importance)
   * - Consistent spacing and alignment for clean appearance
   */
  private formatFileNameForMenu(file: ZshFile): string {
    // Universal arrow indicator shows items are selectable
    const indicator = chalk.yellow.bold('→ ');

    // Apply different colors based on file importance
    // Main .zshrc gets prominent green styling, others get blue
    const fileName = file.isZshrc
      ? chalk.green.bold(file.name) // Main config: bold green
      : chalk.blue(file.name); // Supplementary: regular blue

    return `${indicator}${fileName}`;
  }

  /**
   * Format file names with selection state awareness
   *
   * This method provides an alternative formatting approach that can
   * differentiate between currently selected and non-selected items.
   * While not currently used in the main menu flow, it's available
   * for future enhancements or alternative UI implementations.
   *
   * @param file File metadata for formatting
   * @param isCurrent Whether this file is currently selected/highlighted
   * @returns Formatted string with state-aware styling
   */
  private formatFileName(file: ZshFile, isCurrent: boolean): string {
    // Different indicators for selected vs non-selected items
    const indicator = isCurrent ? chalk.yellow.bold('→ ') : '  ';

    let fileName: string;
    if (isCurrent) {
      // Current selection gets enhanced styling with underlines
      fileName = file.isZshrc
        ? chalk.green.bold.underline(file.name) // Main: green + bold + underline
        : chalk.cyan.bold.underline(file.name); // Other: cyan + bold + underline
    } else {
      // Non-current items use standard styling
      fileName = file.isZshrc
        ? chalk.green(file.name) // Main: green
        : chalk.blue(file.name); // Other: blue
    }

    return `${indicator}${fileName}`;
  }

  /**
   * Open the selected file using the specified opening method
   *
   * This method coordinates the file opening process, providing user feedback
   * and handling any errors that may occur. It serves as the bridge between
   * the interactive menu system and the file opening functionality.
   *
   * @param filePath Full path to the file to be opened
   * @param openType Method to use for opening (vim, code, default, etc.)
   *
   * The opening process:
   * 1. Display feedback about which file is being opened
   * 2. Delegate to the openConfig module for actual file opening
   * 3. Handle success and error cases with appropriate user feedback
   * 4. Provide helpful guidance if opening fails
   */
  private async openFile(filePath: string, openType: OpenType): Promise<void> {
    // Provide immediate feedback about the action being taken
    console.log(chalk.gray(`Opening ${path.basename(filePath)}...`));

    try {
      // Delegate file opening to the specialized openConfig module
      // Pass callback functions for handling success and error cases
      await openFileWithType(
        filePath,
        openType,
        // Success callback: Display positive feedback
        (message: string) => console.log(chalk.green(message)),
        // Error callback: Display error and helpful guidance
        (error: string) => {
          console.log(chalk.red(error));
          console.log(
            chalk.yellow('Tip: Make sure the application is installed and available in your PATH.')
          );
        }
      );
    } catch {
      // Catch block for any unhandled promise rejections
      // Error handling is primarily done through the callbacks above
      // This catch prevents the application from crashing on unexpected errors
    }
  }
}
