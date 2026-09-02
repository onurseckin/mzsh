import { isAbsolute } from 'node:path';
import { isReviewedPlanId } from '../domain/action-plan';
import { commands } from './catalog-definitions';
import type {
  CatalogCommand,
  CatalogCommandName,
  CatalogFlag,
  CatalogParseResult,
  CommandCatalog,
} from './types';

function hasCommand(name: string): name is CatalogCommandName {
  return commands.some((command) => command.name === name);
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
const knownFlagNames = new Set(
  catalog.commands.flatMap((command) => command.parser.flags.map((flag) => flag.name))
);

export type CatalogUsageStyle = 'help' | 'checkout';

function flagFor(command: CatalogCommand, name: string): CatalogFlag | undefined {
  return command.parser.flags.find((flag) => flag.name === name);
}

function formatFlagValue(flag: CatalogFlag, style: CatalogUsageStyle): string {
  if (flag.value === 'boolean') return `--${flag.name}`;
  if (flag.value === 'reviewed-plan-id') return '--plan-id reviewed-plan-id';
  if (flag.value === 'confirmation') return '--confirm APPLY';
  if (flag.value === 'format-style') return '--format <box|tree|compact>';
  if (flag.value === 'status-filter') return '--filter <status>';
  if (flag.value === 'string') return `--${flag.name} <string>`;
  if (style === 'help') return `--${flag.name} absolute-path`;
  return flag.name === 'legacy-source'
    ? `--${flag.name} /absolute/file`
    : `--${flag.name} /absolute/checkout`;
}

function formatUsage(command: CatalogCommand, style: CatalogUsageStyle): string {
  const positional =
    command.parser.positional === 'receipt-id'
      ? ' receipt-id'
      : command.parser.positional === 'optional-category'
        ? ' [category]'
        : command.parser.positional === 'optional-workflow'
          ? ' [workflow]'
          : command.parser.positional === 'environment-operation'
            ? ' <list|get|set> [name]'
            : '';
  const flags = command.parser.flags
    .map((flag) => {
      const value = formatFlagValue(flag, style);
      return flag.required ? value : `[${value}]`;
    })
    .join(' ');
  return `${command.name}${positional}${flags.length === 0 ? '' : ` ${flags}`}`;
}

export function renderCatalogUsage(
  commandName: CatalogCommandName,
  style: CatalogUsageStyle
): string {
  return formatUsage(catalog.require(commandName), style);
}

function parseEnv(positionals: readonly string[], json: boolean): CatalogParseResult {
  const action = positionals[0];
  if (action === 'list' && positionals.length === 1) return { kind: 'env', action: 'list', json };
  if (action === 'get' && positionals.length === 2) {
    const name = positionals[1];
    return name === undefined
      ? { kind: 'usage-error', code: 'unexpected-positional' }
      : { kind: 'env', action: 'get', name, json };
  }
  if (action === 'set' && positionals.length === 2) {
    const name = positionals[1];
    if (name === undefined) return { kind: 'usage-error', code: 'unexpected-positional' };
    return json
      ? { kind: 'usage-error', code: 'invalid-flags' }
      : { kind: 'env', action: 'set', name, json };
  }
  return { kind: 'usage-error', code: 'unexpected-positional' };
}

export function parseCatalogArgs(args: readonly string[]): CatalogParseResult {
  if (args.some((arg) => retired.has(arg))) return { kind: 'retired' };
  const name = args[0];
  if (name === undefined) return { kind: 'unmanaged' };
  if (!catalog.has(name)) return { kind: 'usage-error', code: 'unknown-command' };
  const command = catalog.require(name);
  const values = new Map<CatalogFlag['name'], string | true>();
  const positionals: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const flag = flagFor(command, token.slice(2));
    if (flag === undefined) {
      const code = knownFlagNames.has(token.slice(2) as CatalogFlag['name'])
        ? 'invalid-flags'
        : 'unknown-flag';
      return { kind: 'usage-error', code };
    }
    if (flag.value === 'boolean') {
      if (values.has(flag.name)) return { kind: 'usage-error', code: 'invalid-flags' };
      values.set(flag.name, true);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('-'))
      return { kind: 'usage-error', code: 'invalid-flags' };
    if (flag.value === 'format-style' && value !== 'box' && value !== 'tree' && value !== 'compact')
      return { kind: 'usage-error', code: 'invalid-flags' };
    if (flag.value === 'absolute-path' && !isAbsolute(value))
      return { kind: 'usage-error', code: 'absolute-path-required' };
    if (flag.value === 'reviewed-plan-id' && !isReviewedPlanId(value))
      return { kind: 'usage-error', code: 'plan-id-invalid' };
    if (values.has(flag.name)) return { kind: 'usage-error', code: 'duplicate-flag' };
    values.set(flag.name, value);
    index += 1;
  }
  if (command.parser.kind === 'placeholder' || command.parser.kind === 'tui') {
    if (positionals.length !== 0) return { kind: 'usage-error', code: 'unexpected-positional' };
    return command.parser.kind === 'tui'
      ? { kind: 'tui' }
      : { kind: 'catalog-placeholder', command: command.name };
  }
  const source = values.get('source');
  const legacySource = values.get('legacy-source');
  const apply = values.has('apply');
  const planId = values.get('plan-id');
  const confirmation = values.get('confirm');
  const json = values.has('json');
  if (!apply && (planId !== undefined || confirmation !== undefined)) {
    return { kind: 'usage-error', code: 'invalid-flags' };
  }
  if (command.parser.kind === 'dag') {
    if (positionals.length > 1) return { kind: 'usage-error', code: 'unexpected-positional' };
    const workflowVal = values.get('workflow');
    const workflow = positionals[0] ?? (typeof workflowVal === 'string' ? workflowVal : undefined);
    const rawFormat = values.get('format');
    const format =
      rawFormat === 'box' || rawFormat === 'tree' || rawFormat === 'compact'
        ? rawFormat
        : undefined;
    const criticalPath = values.has('critical-path') ? true : undefined;
    const simulate = values.has('simulate') ? true : undefined;
    const filterVal = values.get('filter');
    const filter = typeof filterVal === 'string' ? filterVal : undefined;
    return {
      kind: 'dag',
      ...(workflow !== undefined ? { workflow } : {}),
      ...(format !== undefined ? { format } : {}),
      ...(criticalPath !== undefined ? { criticalPath } : {}),
      ...(simulate !== undefined ? { simulate } : {}),
      ...(filter !== undefined ? { filter } : {}),
      json,
    };
  }
  if (command.parser.kind === 'audit') {
    return positionals.length === 0
      ? { kind: 'audit', ...(typeof source === 'string' ? { source } : {}), json }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  if (command.parser.kind === 'config') {
    const rawOpenType = values.get('open-type');
    const openType = typeof rawOpenType === 'string' ? rawOpenType : undefined;
    return positionals.length === 0
      ? { kind: 'config', ...(openType !== undefined ? { openType } : {}) }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  if (command.parser.kind === 'inventory') {
    return positionals.length <= 1
      ? {
          kind: 'inventory',
          ...(positionals[0] === undefined ? {} : { categoryId: positionals[0] }),
          json,
        }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  if (command.parser.kind === 'env') return parseEnv(positionals, json);
  if (command.parser.kind === 'setup') {
    return positionals.length === 0
      ? {
          kind: 'setup',
          apply,
          ...(typeof planId === 'string' ? { planId } : {}),
          ...(typeof confirmation === 'string' ? { confirmation } : {}),
        }
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
          ...(typeof planId === 'string' ? { planId } : {}),
          ...(typeof confirmation === 'string' ? { confirmation } : {}),
        }
      : { kind: 'usage-error', code: 'source-required' };
  }
  if (command.parser.kind === 'update') {
    return positionals.length === 0
      ? {
          kind: 'update',
          apply,
          ...(typeof planId === 'string' ? { planId } : {}),
          ...(typeof confirmation === 'string' ? { confirmation } : {}),
        }
      : { kind: 'usage-error', code: 'unexpected-positional' };
  }
  const receiptId = positionals[0];
  if (positionals.length !== 1 || receiptId === undefined)
    return { kind: 'usage-error', code: 'unexpected-positional' };
  if (!/^[A-Za-z0-9_-]+$/.test(receiptId))
    return { kind: 'usage-error', code: 'receipt-id-invalid' };
  return {
    kind: 'rollback',
    receiptId,
    apply,
    ...(typeof planId === 'string' ? { planId } : {}),
    ...(typeof confirmation === 'string' ? { confirmation } : {}),
  };
}

export function renderCatalogHelp(commandName?: CatalogCommandName): string {
  if (commandName === undefined) {
    const lines = catalog.commands.map((command) => {
      const availability = command.available ? '' : ' (planned)';
      return `  ${formatUsage(command, 'help')}${availability}\n    ${command.summary}`;
    });
    return `USAGE\n  bun run mzsh -- <command> [options]\n\nCOMMANDS\n${lines.join('\n')}`;
  }
  const command = catalog.require(commandName);
  const flags = command.parser.flags.map(
    (flag) => `  ${formatFlagValue(flag, 'help')}\n    ${flag.description}`
  );
  const availability = command.available
    ? ''
    : '\n\nStatus: planned; no execution path is available.';
  return (
    [
      'USAGE',
      `  bun run mzsh -- ${formatUsage(command, 'help')}`,
      '',
      command.summary,
      '',
      `Risk: ${command.risk}`,
      ...(flags.length === 0 ? [] : ['', 'FLAGS', ...flags]),
    ].join('\n') + availability
  );
}
