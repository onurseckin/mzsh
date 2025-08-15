/**
 * Self-Uninstaller Module
 *
 * This module provides functionality for mzsh to uninstall itself from the system
 * without requiring access to the project source code. It replicates the core
 * uninstallation logic from the uninstall.sh script in TypeScript.
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { setTimeout } from 'timers/promises';

/**
 * SelfUninstaller - Handles self-uninstallation of mzsh
 *
 * This class provides the ability for mzsh to uninstall itself from anywhere
 * on the system without requiring the original project source code.
 */
export class SelfUninstaller {
  private readonly homeDir = homedir();
  private readonly shellConfigs = [
    join(this.homeDir, '.zshrc'),
    join(this.homeDir, '.bashrc'),
    join(this.homeDir, '.profile'),
    join(this.homeDir, '.bash_profile'),
  ];

  /**
   * Logging functions with colored output
   */
  private logInfo(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }

  private logSuccess(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  private logWarning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  private logError(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
  }

  private logStep(message: string): void {
    console.log(chalk.blue(`🔄 ${message}`));
  }

  /**
   * Execute a shell command safely
   */
  private execCommand(command: string): { success: boolean; output: string } {
    try {
      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      return { success: true, output: output.trim() };
    } catch (_error) {
      return { success: false, output: '' };
    }
  }

  /**
   * Check if mzsh command exists in the system
   */
  private checkMzshExists(): string | null {
    const result = this.execCommand('which mzsh 2>/dev/null');
    return result.success ? result.output : null;
  }

  /**
   * Remove bun link
   */
  private removeBunLink(): boolean {
    const result = this.execCommand('bun unlink 2>/dev/null');
    return result.success;
  }

  /**
   * Remove binary files and symlinks
   */
  private removeBinaries(): number {
    const possibleLocations = [
      join(this.homeDir, '.bun/bin/mzsh'),
      '/usr/local/bin/mzsh',
      '/usr/bin/mzsh',
      join(this.homeDir, '.local/bin/mzsh'),
    ];

    let removedCount = 0;
    for (const location of possibleLocations) {
      if (existsSync(location)) {
        const result = this.execCommand(`rm -f "${location}" 2>/dev/null`);
        if (result.success) {
          removedCount++;
        }
      }
    }

    return removedCount;
  }

  /**
   * Remove package directories
   */
  private removeDirectories(): number {
    const possibleDirs = [
      join(this.homeDir, '.bun/install/global/node_modules/mzsh'),
      join(this.homeDir, '.npm-global/lib/node_modules/mzsh'),
      '/usr/local/lib/node_modules/mzsh',
    ];

    let dirsRemoved = 0;
    for (const dir of possibleDirs) {
      if (existsSync(dir)) {
        const result = this.execCommand(`rm -rf "${dir}" 2>/dev/null`);
        if (result.success) {
          dirsRemoved++;
        }
      }
    }

    return dirsRemoved;
  }

  /**
   * Clean up mzsh-specific shell configuration
   */
  private cleanupShellConfig(): number {
    this.logStep('Cleaning up mzsh-specific configuration...');

    let configCleaned = 0;

    for (const config of this.shellConfigs) {
      if (existsSync(config)) {
        try {
          const content = readFileSync(config, 'utf8');

          // Only remove mzsh installer comments, NEVER remove bun PATH exports
          if (content.includes('# Added by mzsh installer')) {
            this.logInfo(`Found mzsh installer comment in: ${config}`);

            // Create a backup
            const backupPath = `${config}.mzsh-backup`;
            writeFileSync(backupPath, content);
            this.logInfo(`Created backup: ${backupPath}`);

            // Only remove the mzsh installer comment line, preserve PATH exports
            const cleanedContent = content.replace(/# Added by mzsh installer\n?/g, '');
            writeFileSync(config, cleanedContent);

            this.logSuccess(`Cleaned up mzsh installer comment from: ${config}`);
            this.logInfo(
              'Note: Preserved bun PATH configuration as it may be used by other packages'
            );
            configCleaned++;
          }

          // Just inform about bun PATH presence, but never remove it
          if (content.includes('.bun/bin') && content.includes('PATH')) {
            this.logInfo(`Found .bun/bin PATH configuration in: ${config} (preserved)`);
          }
        } catch (_error) {
          this.logWarning(`Could not process config file: ${config}`);
        }
      }
    }

    if (configCleaned === 0) {
      this.logInfo('No mzsh-specific configuration cleanup needed');
    } else {
      this.logSuccess(`Cleaned up mzsh installer comments from ${configCleaned} file(s)`);
      console.log('');
      this.logInfo('Note: bun PATH configuration was preserved for other bun packages');
    }

    return configCleaned;
  }

  /**
   * Verify uninstallation
   */
  private async verifyUninstallation(): Promise<boolean> {
    this.logStep('Verifying uninstallation...');

    // Give a moment for changes to take effect
    await setTimeout(1000);

    const mzshPath = this.checkMzshExists();
    if (mzshPath) {
      this.logWarning(`mzsh command still found at: ${mzshPath}`);
      this.logInfo('This may be a different installation or require manual removal');
      console.log('');
      this.logInfo('To manually remove, you can try:');
      console.log(`  sudo rm -f '${mzshPath}'`);
      console.log('');
      return false;
    } else {
      this.logSuccess('mzsh command successfully removed from system');
      return true;
    }
  }

  /**
   * Restart shell session
   */
  private restartShell(): void {
    this.logInfo('Starting new shell session to apply changes...');
    console.log('');

    // Automatically refresh shell session
    const shell = process.env.SHELL || 'zsh';
    const shellCmd = shell.includes('zsh') ? 'zsh' : shell.includes('bash') ? 'bash' : shell;

    // Use execSync to replace current process, similar to exec in bash
    try {
      execSync(shellCmd, { stdio: 'inherit' });
    } catch (_error) {
      // If exec fails, exit gracefully
      process.exit(0);
    }
  }

  /**
   * Main uninstallation method
   */
  public async runUninstall(): Promise<void> {
    console.log('🗑️  Uninstalling mzsh...');
    console.log('');

    // Remove bun link
    this.removeBunLink();

    // Remove binary files
    const removedCount = this.removeBinaries();

    // Remove directories
    const dirsRemoved = this.removeDirectories();

    // Verify uninstallation
    const verified = await this.verifyUninstallation();
    if (!verified) {
      process.exit(1);
    }

    // Clean up shell configuration
    const configCleaned = this.cleanupShellConfig();

    console.log('');
    this.logSuccess('🎉 mzsh uninstallation completed!');
    console.log('');

    // Restart shell
    this.restartShell();
  }
}
