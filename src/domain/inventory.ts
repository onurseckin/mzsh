import { inventoryCategoryIds, type InventoryCategoryId } from './categories';
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

type RecordDefinition = {
  categoryId: InventoryCategoryId;
  name: string;
  origins: readonly InventoryOrigin[];
  metadata: Readonly<Record<string, (value: unknown) => boolean>>;
};

const recordDefinitions: readonly RecordDefinition[] = [
  { categoryId: 'applications', name: 'mzsh-checkout', origins: ['path'], metadata: {} },
  {
    categoryId: 'runtimes',
    name: 'bun',
    origins: ['path'],
    metadata: {},
  },
  {
    categoryId: 'managers',
    name: 'pnpm',
    origins: ['path'],
    metadata: { globalBinDiscoverable: (value) => typeof value === 'boolean' },
  },
  {
    categoryId: 'shell',
    name: 'zsh-configuration',
    origins: ['environment'],
    metadata: {
      topology: (value) => value === 'modular' || value === 'source-all' || value === 'unknown',
    },
  },
  {
    categoryId: 'scripts',
    name: 'managed-shell-scripts',
    origins: ['path'],
    metadata: { extension: (value) => value === 'zsh' },
  },
  {
    categoryId: 'path',
    name: 'search-path',
    origins: ['environment'],
    metadata: {
      duplicateEntries: (value) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
      entryCount: (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    },
  },
  {
    categoryId: 'environment',
    name: 'private-override-metadata',
    origins: ['environment'],
    metadata: {
      privateAssignmentCount: (value) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
      privateOverride: (value) => value === 'absent' || value === 'present',
    },
  },
];

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCategoryId(value: unknown): value is InventoryCategoryId {
  return (
    typeof value === 'string' && inventoryCategoryIds.some((categoryId) => categoryId === value)
  );
}

function isStatus(value: unknown): value is InventoryStatus {
  return value === 'absent' || value === 'present' || value === 'unknown';
}

function isOrigin(value: unknown): value is InventoryOrigin {
  return value === 'environment' || value === 'manifest' || value === 'path';
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(?:\.\d+){1,3}$/.test(value);
}

function projectMetadata(
  value: unknown,
  definition: RecordDefinition
): InventoryMetadata | undefined {
  if (!isRecordObject(value)) return undefined;
  const metadata: Record<string, boolean | number | string> = {};
  for (const [key, accepts] of Object.entries(definition.metadata)) {
    const candidate = value[key];
    if (
      accepts(candidate) &&
      (typeof candidate === 'boolean' ||
        typeof candidate === 'number' ||
        typeof candidate === 'string')
    )
      metadata[key] = candidate;
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function projectInventoryRecord(value: unknown): InventoryRecord | undefined {
  if (!isRecordObject(value) || !isCategoryId(value.categoryId) || typeof value.name !== 'string')
    return undefined;
  const definition = recordDefinitions.find(
    (candidate) => candidate.categoryId === value.categoryId && candidate.name === value.name
  );
  if (definition === undefined || !isStatus(value.status) || !isOrigin(value.origin))
    return undefined;
  if (!definition.origins.includes(value.origin)) return undefined;
  const version = isVersion(value.version) ? value.version : undefined;
  const metadata = projectMetadata(value.metadata, definition);
  return {
    categoryId: definition.categoryId,
    name: definition.name,
    status: value.status,
    origin: value.origin,
    ...(version === undefined ? {} : { version }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function projectInventoryRecords(values: readonly unknown[]): readonly InventoryRecord[] {
  return values.flatMap((value) => {
    const record = projectInventoryRecord(value);
    return record === undefined ? [] : [record];
  });
}
