import { Command } from 'commander';
import { parseCatalogArgs, renderCatalogHelp } from './command-catalog';
import type { CatalogCommandName, CatalogParseResult } from './types';

export interface CommanderAdapter {
  help(command?: CatalogCommandName): string;
  parse(args: readonly string[]): CatalogParseResult;
}

function renderCommanderHelp(command?: CatalogCommandName): string {
  const program = new Command()
    .name('mzsh')
    .description('Managed Zsh configuration tool')
    .helpOption(false);
  return `${program.helpInformation()}\n${renderCatalogHelp(command)}`;
}

export function parseCommanderArgs(args: readonly string[]): CatalogParseResult {
  return parseCatalogArgs(args);
}

export function createCommanderAdapter(): CommanderAdapter {
  return {
    help: renderCommanderHelp,
    parse: parseCommanderArgs,
  };
}
