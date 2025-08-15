/**
 * File Discovery Module for zshrc-manager
 *
 * This module is responsible for locating and cataloging zsh configuration files
 * on the user's system. It implements a systematic approach to finding files in
 * standard locations where zsh configurations are typically stored.
 *
 * Key features:
 * - Discovers the main .zshrc file in the user's home directory
 * - Scans the ~/.config/zsh/ directory for additional configuration files
 * - Filters out directories, only including actual files
 * - Provides structured metadata about each discovered file
 * - Implements intelligent sorting (main .zshrc first, then alphabetical)
 *
 * The module follows the XDG Base Directory Specification and common zsh
 * configuration patterns to ensure comprehensive file discovery.
 */

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

/**
 * Represents a discovered zsh configuration file with metadata
 *
 * This interface provides structured information about each file found
 * during the discovery process, enabling the UI to present meaningful
 * information to users and handle files appropriately.
 */
export interface ZshFile {
  /** Display name of the file (e.g., '.zshrc', 'aliases.zsh') */
  name: string;

  /** Full absolute path to the file on the filesystem */
  path: string;

  /** Whether this is the main .zshrc file (affects display priority and styling) */
  isZshrc: boolean;
}

/**
 * FileDiscovery - Handles systematic discovery of zsh configuration files
 *
 * This class implements a comprehensive file discovery strategy that covers
 * the most common locations where zsh configuration files are stored. It
 * provides a clean interface for other modules to obtain a list of available
 * configuration files without needing to understand the discovery logic.
 *
 * Discovery strategy:
 * 1. Check for main .zshrc file in home directory
 * 2. Scan ~/.config/zsh/ directory for additional files
 * 3. Filter results to include only regular files (not directories)
 * 4. Sort results with .zshrc first, then alphabetically
 *
 * The class is designed to be:
 * - Robust: Handles missing directories and files gracefully
 * - Efficient: Uses async I/O operations for better performance
 * - Extensible: Easy to add new discovery locations in the future
 */
export class FileDiscovery {
  /**
   * Discover all zsh configuration files on the system
   *
   * This method implements the core file discovery logic, systematically
   * checking known locations for zsh configuration files. It handles
   * various edge cases like missing directories or permission issues.
   *
   * @returns Promise<ZshFile[]> Array of discovered files with metadata
   *
   * The discovery process:
   * 1. Initialize empty results array
   * 2. Check for main .zshrc file in home directory
   * 3. Scan ~/.config/zsh/ directory for additional files
   * 4. Filter out directories, keeping only regular files
   * 5. Sort results with .zshrc prioritized, then alphabetical
   * 6. Return structured file information
   */
  async discoverZshFiles(): Promise<ZshFile[]> {
    const homeDir = os.homedir();
    const files: ZshFile[] = [];

    // DISCOVERY PHASE 1: Main .zshrc file
    // Check for the primary zsh configuration file in the user's home directory
    // This is the most common location and should be prioritized in the UI
    const zshrcPath = path.join(homeDir, '.zshrc');
    if (await fs.pathExists(zshrcPath)) {
      files.push({
        name: '.zshrc',
        path: zshrcPath,
        isZshrc: true, // Mark as main config file for special handling
      });
    }

    // DISCOVERY PHASE 2: Additional configuration files
    // Scan the XDG-compliant configuration directory for additional zsh files
    // This follows modern configuration organization practices
    const configZshDir = path.join(homeDir, '.config', 'zsh');
    if (await fs.pathExists(configZshDir)) {
      const configFiles = await fs.readdir(configZshDir);

      // Process each item in the configuration directory
      for (const file of configFiles) {
        const filePath = path.join(configZshDir, file);
        const stat = await fs.stat(filePath);

        // FILTERING: Only include regular files, skip directories and special files
        // This prevents issues with subdirectories or symlinks that might cause problems
        if (stat.isFile()) {
          files.push({
            name: file,
            path: filePath,
            isZshrc: false, // These are supplementary files, not the main config
          });
        }
      }
    }

    // SORTING PHASE: Organize files for optimal user experience
    // Priority order: .zshrc first (most important), then alphabetical
    // This ensures the main configuration file is always at the top of lists
    files.sort((a, b) => {
      // Main .zshrc file always comes first
      if (a.isZshrc && !b.isZshrc) return -1;
      if (!a.isZshrc && b.isZshrc) return 1;

      // For files of the same type, sort alphabetically for predictable ordering
      return a.name.localeCompare(b.name);
    });

    return files;
  }
}
