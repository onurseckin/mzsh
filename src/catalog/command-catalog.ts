import { isAbsolute } from 'node:path';
import type {
  CatalogCommand,
  CatalogCommandName,
  CatalogFlag,
  CatalogParseResult,
  CommandCatalog,
} from './types';
import { catalogCommandNames } from './types';

const applyFlag: CatalogFlag = {
  name: 'apply',
  value: 'boolean',
  description: 'Apply the reviewed transaction instead of showing its plan.',
};
const jsonFlag: CatalogFlag = {
  name: 'json',
  value: 'boolean',
  description: 'Render the audit report as JSON.',
};
const sourceFlag: CatalogFlag = {
  name: 'source',
  value: 'absolute-path',
  description: 'Use an absolute checkout path.',
};
const legacySourceFlag: CatalogFlag = {
  name: 'legacy-source',
  value: 'absolute-path',
  description: 'Inspect one absolute legacy configuration path during adoption.',
};

const commands: readonly CatalogCommand[] = [
  {
    name: 'audit',
    summary: 'Inspect the local managed-shell environment.',
    risk: 'read-only',
    available: true,
    checkoutUsage: 'audit [--source /absolute/checkout] [--json]',
    parser: { kind: 'audit', flags: [sourceFlag, jsonFlag], positional: 'none' },
  },
  {
    name: 'bootstrap',
    summary: 'Plan or apply initial managed-shell adoption.',
    risk: 'destructive',
    available: true,
    checkoutUsage: 'bootstrap --source /absolute/checkout [--apply]',
    parser: {
      kind: 'bootstrap',
      flags: [{ ...sourceFlag, required: true }, legacySourceFlag, applyFlag],
      positional: 'none',
    },
  },
  {
    name: 'update',
    summary: 'Plan or apply a local managed update.',
    risk: 'destructive',
    available: true,
    checkoutUsage: 'update [--source /absolute/checkout] [--apply]',
    parser: { kind: 'update', flags: [sourceFlag, applyFlag], positional: 'none' },
  },
  {
    name: 'rollback',
    summary: 'Restore one recorded adoption transaction.',
    risk: 'destructive',
    available: true,
    checkoutUsage: 'rollback receipt-id [--apply]',
    parser: { kind: 'rollback', flags: [applyFlag], positional: 'receipt-id' },
  },
  {
    name: 'setup',
    summary: 'Set up the managed MZSH lifecycle.',
    risk: 'destructive',
    available: false,
    checkoutUsage: 'setup',
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
  {
    name: 'history',
    summary: 'Inspect recorded managed action history.',
    risk: 'read-only',
    available: false,
    checkoutUsage: 'history',
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
  {
    name: 'inventory',
    summary: 'Inspect observed machine inventory.',
    risk: 'read-only',
    available: false,
    checkoutUsage: 'inventory',
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
  {
    name: 'env',
    summary: 'Access the private environment boundary.',
    risk: 'sensitive',
    available: false,
    checkoutUsage: 'env',
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
  {
    name: 'tui',
    summary: 'Open the full-screen MZSH interface.',
    risk: 'read-only',
    available: false,
    checkoutUsage: 'tui',
    parser: { kind: 'placeholder', flags: [], positional: 'none' },
  },
];

function hasCommand(name: string): name is CatalogCommandName {
  return catalogCommandNames.includes(name as CatalogCommandName);
}

function requireCommand(name: CatalogCommandName): CatalogCommand {
  const command = commands.find((entry) => entry.name === name);
  if (command === undefined) throw new Error(`Unknown catalog command: ${name}`);
  return command;
}

export const catalog: CommandCatalog = {
  commands,
  has: hasCommand,
  require: requireCommand,
};

const retired = new Set(['--update', '--reinstall', '--uninst']);
const knownFlagNames = new Set(['apply', 'json', 'source', 'legacy-source']);

function flagFor(command: CatalogCommand, name: string): CatalogFlag | undefined {
  return command.parser.flags.find((flag) => flag.name === name);
}

function formatFlag(flag: CatalogFlag): string {
  return flag.value === 'boolean' ? `--${flag.name}` : `--${flag.name} absolute-path`;
}

function formatUsage(command: CatalogCommand): string {
  const positional = command.parser.positional === 'receipt-id' ? ' receipt-id' : '';
  const flags = command.parser.flags
    .map((flag) => {
      const value = formatFlag(flag);
      return flag.required ? value : `[${value}]`;
    })
    .join(' ');
  return `${command.name}${positional}${flags.length === 0 ? '' : ` ${flags}`}`;
}

function placeholderResult(
  command: CatalogCommandName
): Extract<CatalogParseResult, { kind: 'catalog-placeholder' }> {
  switch (command) {
    case 'setup':
    case 'history':
    case 'inventory':
    case 'env':
    case 'tui':
      return { kind: 'catalog-placeholder', command };
    default:
      throw new Error(`Catalog command is not a placeholder: ${command}`);
  }
}

export function parseCatalogArgs(args: readonly string[]): CatalogParseResult {
  if (args.some((arg) => retired.has(arg))) return { kind: 'retired' };
  const name = args[0];
  if (name === undefined) return { kind: 'unmanaged' };
  if (!catalog.has(name)) return { kind: 'usage-error', code: 'unknown-command' };
  const command = catalog.require(name);
  if (command.parser.kind === 'placeholder') {
    return args.length === 1
      ? placeholderResult(command.name)
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  const values = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index]!;
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const flag = flagFor(command, token.slice(2));
    if (flag === undefined) {
      return {
        kind: 'usage-error',
        code: knownFlagNames.has(token.slice(2)) ? 'invalid-flags' : 'unknown-flag',
      };
    }
    if (values.has(flag.name)) return { kind: 'usage-error', code: 'duplicate-flag' };
    if (flag.value === 'boolean') {
      values.set(flag.name, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('-') || !isAbsolute(value)) {
      return { kind: 'usage-error', code: 'absolute-path-required' };
    }
    values.set(flag.name, value);
    index += 1;
  }
  const source = values.get('source');
  const legacySource = values.get('legacy-source');
  const apply = values.has('apply');
  const json = values.has('json');
  if (command.parser.kind === 'audit') {
    return positionals.length === 0
      ? { kind: 'audit', ...(typeof source === 'string' ? { source } : {}), json }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  if (command.parser.kind === 'bootstrap') {
    if (positionals.length > 0) return { kind: 'usage-error', code: 'unexpected-positional' };
    return typeof source === 'string'
      ? {
          kind: 'bootstrap',
          source,
          ...(typeof legacySource === 'string' ? { legacySource } : {}),
          apply,
        }
      : { kind: 'usage-error', code: 'source-required' };
  }
  if (command.parser.kind === 'update') {
    return positionals.length === 0
      ? { kind: 'update', ...(typeof source === 'string' ? { source } : {}), apply }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  if (command.parser.kind === 'rollback') {
    const receiptId = positionals[0];
    if (positionals.length !== 1) return { kind: 'usage-error', code: 'unexpected-positional' };
    return receiptId === undefined || !/^[A-Za-z0-9_-]+$/.test(receiptId)
      ? { kind: 'usage-error', code: 'receipt-id-invalid' }
      : { kind: 'rollback', receiptId, apply };
  }
  return { kind: 'usage-error', code: 'unknown-command' };
}

export function renderCatalogHelp(commandName?: CatalogCommandName): string {
  if (commandName === undefined) {
    const lines = catalog.commands.map((command) => {
      const availability = command.available ? '' : ' (planned)';
      return `  ${formatUsage(command)}${availability}\n    ${command.summary}`;
    });
    return `USAGE\n  bun run mzsh -- <command> [options]\n\nCOMMANDS\n${lines.join('\n')}`;
  }
  const command = catalog.require(commandName);
  const flags = command.parser.flags.map(
    (flag) => `  ${formatFlag(flag)}\n    ${flag.description}`
  );
  const availability = command.available
    ? ''
    : '\n\nStatus: planned; no execution path is available.';
  return (
    [
      'USAGE',
      `  bun run mzsh -- ${formatUsage(command)}`,
      '',
      command.summary,
      '',
      `Risk: ${command.risk}`,
      ...(flags.length === 0 ? [] : ['', 'FLAGS', ...flags]),
    ].join('\n') + availability
  );
}
