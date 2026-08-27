import type { InventoryCategoryId } from './categories';
import type { EnvironmentSnapshot } from './audit';

export type InventoryOrigin = 'environment' | 'manifest' | 'path';
export type InventoryStatus = 'absent' | 'present' | 'unknown';
export type InventoryMetadata = Readonly<Record<string, boolean | number | string>>;

export interface InventoryRecord {
  categoryId: InventoryCategoryId;
  name: string;
  status: InventoryStatus;
  origin: InventoryOrigin;
  version?: string;
  metadata?: InventoryMetadata;
}

export interface InventoryCollectionInput {
  categoryId?: string;
  snapshot?: EnvironmentSnapshot;
}

export interface InventoryProvider {
  collect(input: InventoryCollectionInput): readonly InventoryRecord[];
}
