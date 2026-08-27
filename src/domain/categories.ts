export const inventoryCategoryIds = [
  'applications',
  'runtimes',
  'managers',
  'shell',
  'scripts',
  'path',
  'environment',
] as const;

export type InventoryCategoryId = (typeof inventoryCategoryIds)[number];

export interface InventoryCategory {
  id: InventoryCategoryId;
  label: string;
}

export class CategoryRegistry {
  private readonly categories = new Map<InventoryCategoryId, InventoryCategory>();

  constructor(entries: readonly InventoryCategory[]) {
    for (const entry of entries) {
      if (this.categories.has(entry.id)) throw new Error('Duplicate inventory category');
      this.categories.set(entry.id, { ...entry });
    }
  }

  has(id: string): id is InventoryCategoryId {
    return this.categories.has(id as InventoryCategoryId);
  }

  list(): readonly InventoryCategory[] {
    return [...this.categories.values()];
  }

  require(id: InventoryCategoryId): InventoryCategory {
    const category = this.categories.get(id);
    if (category === undefined) throw new Error('Unknown inventory category');
    return category;
  }
}
