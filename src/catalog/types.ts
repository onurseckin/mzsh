export type CommandRisk = 'read-only' | 'destructive' | 'sensitive';

export type CatalogFlag =
  | { name: 'apply'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'plan-id'; value: 'reviewed-plan-id'; description: string; required?: boolean }
  | { name: 'confirm'; value: 'confirmation'; description: string; required?: boolean }
  | { name: 'json'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'source'; value: 'absolute-path'; description: string; required?: boolean }
  | { name: 'legacy-source'; value: 'absolute-path'; description: string; required?: boolean };

export type CatalogParser =
  | { kind: 'audit'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'bootstrap'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'update'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'rollback'; flags: readonly CatalogFlag[]; positional: 'receipt-id' }
  | { kind: 'placeholder'; flags: readonly CatalogFlag[]; positional: 'none' };

export type CatalogPaletteMetadata = {
  keywords: readonly string[];
};

export type CatalogCommand =
  | {
      name: 'audit';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      parser: Extract<CatalogParser, { kind: 'audit' }>;
    }
  | {
      name: 'bootstrap';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      parser: Extract<CatalogParser, { kind: 'bootstrap' }>;
    }
  | {
      name: 'update';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      parser: Extract<CatalogParser, { kind: 'update' }>;
    }
  | {
      name: 'rollback';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      parser: Extract<CatalogParser, { kind: 'rollback' }>;
    }
  | {
      name: 'setup' | 'history' | 'inventory' | 'env' | 'tui';
      summary: string;
      risk: CommandRisk;
      available: false;
      palette: CatalogPaletteMetadata;
      parser: Extract<CatalogParser, { kind: 'placeholder' }>;
    };

export type CatalogCommandName = CatalogCommand['name'];

export type ManagedCommand =
  | { kind: 'audit'; source?: string; json: boolean }
  | (MutationCommand & { kind: 'bootstrap'; source: string; legacySource?: string })
  | (MutationCommand & { kind: 'update'; source?: string })
  | (MutationCommand & { kind: 'rollback'; receiptId: string });

export interface MutationCommand {
  apply: boolean;
  planId?: string;
  confirmation?: string;
}

export type CatalogParseResult =
  | ManagedCommand
  | { kind: 'catalog-placeholder'; command: CatalogCommandName }
  | { kind: 'usage-error'; code: string }
  | { kind: 'retired' }
  | { kind: 'unmanaged' };

export interface CommandCatalog {
  readonly commands: readonly CatalogCommand[];
  has(name: string): name is CatalogCommandName;
  require(name: CatalogCommandName): CatalogCommand;
}
