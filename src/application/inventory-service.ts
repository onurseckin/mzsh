import { CategoryRegistry } from '../domain/categories';
import type {
  InventoryCollectionInput,
  InventoryProvider,
  InventoryRecord,
} from '../domain/inventory';

function snapshotRecords(input: InventoryCollectionInput): readonly InventoryRecord[] {
  const snapshot = input.snapshot;
  if (snapshot === undefined) return [];
  const uniquePathEntries = new Set(snapshot.pathEntries.map((entry) => entry.path)).size;
  const privateOverride = snapshot.privateFile.kind === 'absent' ? 'absent' : 'present';
  return [
    {
      categoryId: 'applications',
      name: 'mzsh-checkout',
      status: snapshot.repository.kind === 'present' ? 'present' : 'absent',
      origin: 'path',
    },
    {
      categoryId: 'managers',
      name: 'pnpm',
      status: snapshot.pnpm.status,
      origin: 'path',
      metadata: { globalBinDiscoverable: snapshot.pnpm.globalBinDiscoverable },
    },
    {
      categoryId: 'shell',
      name: 'zsh-configuration',
      status: snapshot.zshTopology === 'unknown' ? 'unknown' : 'present',
      origin: 'environment',
      metadata: { topology: snapshot.zshTopology },
    },
    {
      categoryId: 'scripts',
      name: 'managed-shell-scripts',
      status: snapshot.currentLink === 'valid' ? 'present' : 'absent',
      origin: 'path',
      metadata: { extension: 'zsh' },
    },
    {
      categoryId: 'path',
      name: 'search-path',
      status: 'present',
      origin: 'environment',
      metadata: {
        duplicateEntries: snapshot.pathEntries.length - uniquePathEntries,
        entryCount: snapshot.pathEntries.length,
      },
    },
    {
      categoryId: 'environment',
      name: 'private-override-metadata',
      status: privateOverride === 'present' ? 'present' : 'absent',
      origin: 'environment',
      metadata: {
        privateAssignmentCount: snapshot.privateFile.assignmentCount,
        privateOverride,
      },
    },
  ];
}

export function collectInventory(
  input: InventoryCollectionInput,
  registry: CategoryRegistry,
  providers: readonly InventoryProvider[]
): readonly InventoryRecord[] {
  if (input.categoryId !== undefined && !registry.has(input.categoryId))
    throw new Error('Unknown inventory category');
  const records = [
    ...snapshotRecords(input),
    ...providers.flatMap((provider) => provider.collect(input)),
  ];
  return records.filter(
    (record) =>
      registry.has(record.categoryId) &&
      (input.categoryId === undefined || record.categoryId === input.categoryId)
  );
}

export class InventoryService {
  constructor(
    private readonly registry: CategoryRegistry,
    private readonly providers: readonly InventoryProvider[]
  ) {}

  collect(input: InventoryCollectionInput): readonly InventoryRecord[] {
    return collectInventory(input, this.registry, this.providers);
  }
}
