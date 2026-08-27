import { readFileSync } from 'node:fs';
import {
  inventoryCategoryIds,
  type InventoryCategory,
  type InventoryCategoryId,
} from '../domain/categories';

export interface MachineManifest {
  version: 1;
  categories: readonly InventoryCategory[];
}

function isCategoryId(value: unknown): value is InventoryCategoryId {
  return (
    typeof value === 'string' && inventoryCategoryIds.some((categoryId) => categoryId === value)
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
    !candidate.categories.every(isCategory) ||
    candidate.categories.length !== inventoryCategoryIds.length ||
    candidate.categories.some((category, index) => category.id !== inventoryCategoryIds[index])
  )
    throw new Error('Invalid machine manifest');
  const categories = candidate.categories.map((category) => Object.freeze({ ...category }));
  return Object.freeze({
    version: 1,
    categories: Object.freeze(categories),
  });
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
