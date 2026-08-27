import { parseCatalogArgs } from '../catalog/command-catalog';
import type { CatalogParseResult } from '../catalog/types';

export type { ManagedCommand } from '../catalog/types';
export type ParsedArguments = CatalogParseResult;

export function parseArguments(args: readonly string[]): ParsedArguments {
  return parseCatalogArgs(args);
}
