import { readFileSync } from 'node:fs';
import type { InventoryCategory, InventoryCategoryId } from '../domain/categories';

export interface MachineManifest {
  version: 1;
  categories: readonly InventoryCategory[];
}

function isCategoryId(value: unknown): value is InventoryCategoryId {
  return (
    typeof value === 'string' &&
    ['applications', 'runtimes', 'managers', 'shell', 'scripts', 'path', 'environment'].includes(
      value
    )
  );
}

function isCategory(value: unknown): value is InventoryCategory {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; label?: unknown };
  return (
    isCategoryId(candidate.id) && typeof candidate.label === 'string' && candidate.label.length > 0
  );
}

export function parseMachineManifest(value: unknown): MachineManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid machine manifest');
  const candidate = value as { version?: unknown; categories?: unknown };
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.categories) ||
    !candidate.categories.every(isCategory)
  )
    throw new Error('Invalid machine manifest');
  return {
    version: 1,
    categories: candidate.categories.map((category) => ({ ...category })),
  };
}

export function readMachineManifest(path: string): MachineManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('Invalid machine manifest');
  }
  return parseMachineManifest(parsed);
}
