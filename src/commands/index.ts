import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import inquirer from 'inquirer';
import * as os from 'os';
import * as path from 'path';
import {
  type OpenType,
  getAvailableOpenTypes,
  getOpenConfig,
  isValidOpenType,
  openFileWithType,
} from '../openConfig';

interface ZshFile {
  name: string;
  path: string;
  isZshrc: boolean;
}

export default class ZshrcManager extends Command {
  static override description = 'Interactive zsh configuration file manager';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o vim',
    '<%= config.bin %> <%= command.id %> --open-type code',
  ];

  static override flags = {
    'open-type': Flags.string({
      char: 'o',
      description: `How to open the selected file. Options: ${getAvailableOpenTypes().join(', ')}`,
      default: 'default',
      options: getAvailableOpenTypes(),
    }),
  };

  override async run(): Promise<void> {
    try {
      // Parse flags manually if oclif config is not available
      let openType: OpenType = 'default';

      if (this.config && typeof this.config.runHook === 'function') {
        // Full oclif environment available
        const { flags } = await this.parse(ZshrcManager);
        openType = flags['open-type'] as OpenType;
      } else {
        // Standalone mode - parse arguments manually
        const args = this.argv || process.argv.slice(2);

        // Handle help flag
        if (args.includes('--help') || args.includes('-h')) {
          console.log('Interactive zsh configuration file manager');
          console.log('');
          console.log('USAGE');
          console.log('  zshrc [OPTIONS]');
          console.log('');
          console.log('OPTIONS');
          console.log('  -o, --open-type <type>  How to open the selected file');
          console.log(`                          Options: ${getAvailableOpenTypes().join(', ')}`);
          console.log('  -h, --help              Show help');
          console.log('');
          console.log('EXAMPLES');
          console.log('  zshrc                   # Use default application');
          console.log('  zshrc -o vim           # Open with vim');
          console.log('  zshrc --open-type code # Open with VS Code');
          return;
        }

        const openTypeIndex = args.findIndex((arg) => arg === '-o' || arg === '--open-type');
        if (openTypeIndex !== -1 && args[openTypeIndex + 1]) {
          const providedType = args[openTypeIndex + 1];
          if (providedType && isValidOpenType(providedType)) {
            openType = providedType;
          } else {
            console.error(
              `Invalid open type: ${providedType}. Available options: ${getAvailableOpenTypes().join(', ')}`
            );
            process.exit(1);
          }
        }
      }

      const files = await this.discoverZshFiles();

      if (files.length === 0) {
        console.log(chalk.yellow('No zsh configuration files found.'));
        return;
      }

      // Show which opening method will be used
      const config = getOpenConfig(openType);
      console.log(chalk.gray(`Opening method: ${config.name} - ${config.description}`));
      console.log('');

      await this.showInteractiveMenu(files, openType);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }

  private async discoverZshFiles(): Promise<ZshFile[]> {
    const homeDir = os.homedir();
    const files: ZshFile[] = [];

    // Add .zshrc if it exists
    const zshrcPath = path.join(homeDir, '.zshrc');
    if (await fs.pathExists(zshrcPath)) {
      files.push({
        name: '.zshrc',
        path: zshrcPath,
        isZshrc: true,
      });
    }

    // Add files from ~/.config/zsh/ directory
    const configZshDir = path.join(homeDir, '.config', 'zsh');
    if (await fs.pathExists(configZshDir)) {
      const configFiles = await fs.readdir(configZshDir);

      for (const file of configFiles) {
        const filePath = path.join(configZshDir, file);
        const stat = await fs.stat(filePath);

        // Only include regular files (not directories)
        if (stat.isFile()) {
          files.push({
            name: file,
            path: filePath,
            isZshrc: false,
          });
        }
      }
    }

    // Sort files: .zshrc first, then alphabetically
    files.sort((a, b) => {
      if (a.isZshrc && !b.isZshrc) return -1;
      if (!a.isZshrc && b.isZshrc) return 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  }

  private async showInteractiveMenu(files: ZshFile[], openType: OpenType): Promise<void> {
    const choices = files.map((file) => ({
      name: this.formatFileNameForMenu(file),
      value: file.path,
      short: file.name,
    }));

    const { selectedFile } = await inquirer.prompt({
      type: 'list',
      name: 'selectedFile',
      message: chalk.cyan('Available zsh configuration files:'),
      choices,
      pageSize: Math.min(files.length + 2, 15),
      loop: false,
    });

    await this.openFile(selectedFile, openType);
  }

  private formatFileNameForMenu(file: ZshFile): string {
    const indicator = chalk.yellow.bold('→ ');
    const fileName = file.isZshrc ? chalk.green.bold(file.name) : chalk.blue(file.name);

    return `${indicator}${fileName}`;
  }

  private formatFileName(file: ZshFile, isCurrent: boolean): string {
    const indicator = isCurrent ? chalk.yellow.bold('→ ') : '  ';

    let fileName: string;
    if (isCurrent) {
      // Current selection: bright/bold colors
      fileName = file.isZshrc
        ? chalk.green.bold.underline(file.name)
        : chalk.cyan.bold.underline(file.name);
    } else {
      // Non-current items: normal colors
      fileName = file.isZshrc ? chalk.green(file.name) : chalk.blue(file.name);
    }

    return `${indicator}${fileName}`;
  }

  private async openFile(filePath: string, openType: OpenType): Promise<void> {
    console.log(chalk.gray(`Opening ${path.basename(filePath)}...`));

    try {
      await openFileWithType(
        filePath,
        openType,
        (message: string) => console.log(chalk.green(message)),
        (error: string) => {
          console.log(chalk.red(error));
          console.log(
            chalk.yellow('Tip: Make sure the application is installed and available in your PATH.')
          );
        }
      );
    } catch {
      // Error handling is done in the callback above
      // This catch is just to prevent unhandled promise rejection
    }
  }
}
