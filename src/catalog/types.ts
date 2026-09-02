export type CommandRisk = 'read-only' | 'destructive' | 'sensitive';

export type CatalogFlag =
  | { name: 'apply'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'plan-id'; value: 'reviewed-plan-id'; description: string; required?: boolean }
  | { name: 'confirm'; value: 'confirmation'; description: string; required?: boolean }
  | { name: 'json'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'source'; value: 'absolute-path'; description: string; required?: boolean }
  | { name: 'legacy-source'; value: 'absolute-path'; description: string; required?: boolean }
  | { name: 'format'; value: 'format-style'; description: string; required?: boolean }
  | { name: 'critical-path'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'simulate'; value: 'boolean'; description: string; required?: boolean }
  | { name: 'filter'; value: 'status-filter'; description: string; required?: boolean }
  | { name: 'workflow'; value: 'string'; description: string; required?: boolean }
  | { name: 'open-type'; value: 'string'; description: string; required?: boolean };

export type CatalogParser =
  | { kind: 'audit'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'inventory'; flags: readonly CatalogFlag[]; positional: 'optional-category' }
  | { kind: 'env'; flags: readonly CatalogFlag[]; positional: 'environment-operation' }
  | { kind: 'setup'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'bootstrap'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'update'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'rollback'; flags: readonly CatalogFlag[]; positional: 'receipt-id' }
  | { kind: 'dag'; flags: readonly CatalogFlag[]; positional: 'optional-workflow' }
  | { kind: 'config'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'tui'; flags: readonly CatalogFlag[]; positional: 'none' }
  | { kind: 'placeholder'; flags: readonly CatalogFlag[]; positional: 'none' };

export type CatalogPaletteMetadata = {
  keywords: readonly string[];
};

export type CatalogTuiMetadata = {
  readonly keys: readonly ['space', string];
  readonly leader: 'space';
  readonly navigation: readonly [
    { readonly screen: 'dashboard'; readonly keys: readonly ['g', 'd'] },
    { readonly screen: 'plan-review'; readonly keys: readonly ['g', 'p'] },
    { readonly screen: 'history'; readonly keys: readonly ['g', 'h'] },
    { readonly screen: 'dag'; readonly keys: readonly ['g', 'g'] },
  ];
};

export type CatalogCommand =
  | {
      name: 'setup';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'setup' }>;
    }
  | {
      name: 'audit';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'audit' }>;
    }
  | {
      name: 'bootstrap';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'bootstrap' }>;
    }
  | {
      name: 'update';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'update' }>;
    }
  | {
      name: 'rollback';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'rollback' }>;
    }
  | {
      name: 'inventory';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'inventory' }>;
    }
  | {
      name: 'env';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'env' }>;
    }
  | {
      name: 'history';
      summary: string;
      risk: CommandRisk;
      available: false;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'placeholder' }>;
    }
  | {
      name: 'tui';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'tui' }>;
    }
  | {
      name: 'config';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'config' }>;
    }
  | {
      name: 'dag';
      summary: string;
      risk: CommandRisk;
      available: true;
      palette: CatalogPaletteMetadata;
      tui: CatalogTuiMetadata;
      parser: Extract<CatalogParser, { kind: 'dag' }>;
    };

export type CatalogCommandName = CatalogCommand['name'];

export type ManagedCommand =
  | { kind: 'audit'; source?: string; json: boolean }
  | { kind: 'inventory'; categoryId?: string; json: boolean }
  | { kind: 'env'; action: 'list'; json: boolean }
  | { kind: 'env'; action: 'get'; name: string; json: boolean }
  | { kind: 'env'; action: 'set'; name: string; json: boolean }
  | {
      kind: 'dag';
      workflow?: string;
      format?: 'box' | 'tree' | 'compact';
      criticalPath?: boolean;
      simulate?: boolean;
      filter?: string;
      json: boolean;
    }
  | { kind: 'config'; openType?: string }
  | { kind: 'tui' }
  | (MutationCommand & { kind: 'setup' })
  | (MutationCommand & { kind: 'bootstrap'; source: string; legacySource?: string })
  | (MutationCommand & { kind: 'update' })
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
