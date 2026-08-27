import type { CatalogCommandName, CommandCatalog, CommandRisk } from './types';

export type CatalogPaletteItem = {
  command: CatalogCommandName;
  label: string;
  keywords: readonly string[];
  risk: CommandRisk;
  available: boolean;
};

export function projectCatalogPalette(catalog: CommandCatalog): readonly CatalogPaletteItem[] {
  return catalog.commands.map((command) => ({
    command: command.name,
    label: command.summary,
    keywords: command.palette.keywords,
    risk: command.risk,
    available: command.available,
  }));
}
