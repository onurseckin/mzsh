export const catalogCommandNames = [
  'audit',
  'bootstrap',
  'update',
  'rollback',
  'setup',
  'history',
  'inventory',
  'env',
  'tui',
] as const;

export type CatalogCommandName = (typeof catalogCommandNames)[number];
export type CommandRisk = 'read-only' | 'destructive' | 'sensitive';

export type CatalogFlag =
  | { name: 'apply'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'json'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'source'; value: 'absolute-path'; description: string; required?: boolean }
  | { name: 'legacy-source'; value: 'absolute-path'; description: string; required?: boolean };

export type CatalogParser =
  | {
      kind: 'audit';
      flags: readonly [CatalogFlag, CatalogFlag];
      positional: 'none';
    }
  | {
      kind: 'bootstrap';
      flags: readonly [CatalogFlag, CatalogFlag, CatalogFlag];
      positional: 'none';
    }
  | {
      kind: 'update';
      flags: readonly [CatalogFlag, CatalogFlag];
      positional: 'none';
    }
  | {
      kind: 'rollback';
      flags: readonly [CatalogFlag];
      positional: 'receipt-id';
    }
  | { kind: 'placeholder'; flags: readonly []; positional: 'none' };

export type CatalogCommand = {
  [Name in CatalogCommandName]: {
    name: Name;
    summary: string;
    risk: CommandRisk;
    available: boolean;
    checkoutUsage: string;
    parser: Name extends 'audit'
      ? Extract<CatalogParser, { kind: 'audit' }>
      : Name extends 'bootstrap'
        ? Extract<CatalogParser, { kind: 'bootstrap' }>
        : Name extends 'update'
          ? Extract<CatalogParser, { kind: 'update' }>
          : Name extends 'rollback'
            ? Extract<CatalogParser, { kind: 'rollback' }>
            : Extract<CatalogParser, { kind: 'placeholder' }>;
  };
}[CatalogCommandName];

export type ManagedCommand =
  | { kind: 'audit'; source?: string; json: boolean }
  | { kind: 'bootstrap'; source: string; legacySource?: string; apply: boolean }
  | { kind: 'update'; source?: string; apply: boolean }
  | { kind: 'rollback'; receiptId: string; apply: boolean };

export type CatalogParseResult =
  | ManagedCommand
  | { kind: 'catalog-placeholder'; command: Exclude<CatalogCommandName, ManagedCommand['kind']> }
  | { kind: 'usage-error'; code: string }
  | { kind: 'retired' }
  | { kind: 'unmanaged' };

export interface CommandCatalog {
  readonly commands: readonly CatalogCommand[];
  has(name: string): name is CatalogCommandName;
  require(name: CatalogCommandName): CatalogCommand;
}
