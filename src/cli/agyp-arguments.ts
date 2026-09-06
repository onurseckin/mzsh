import { findCommand, type AgypCommandSpec } from './agyp-commands';

export interface ParsedArguments {
  command: AgypCommandSpec;
  /** Positional value, already validated against the command's argument spec. */
  argument?: string;
  flags: ReadonlyMap<string, string | true>;
  /** Set when the caller asked for help rather than an action. */
  wantsHelp: boolean;
}

export interface ParseFailure {
  usageError: string;
  /** Command whose help is worth showing alongside the error. */
  command?: AgypCommandSpec;
}

export type ParseResult =
  | { ok: true; parsed: ParsedArguments }
  | { ok: false; failure: ParseFailure };

function suggest(candidate: string, known: readonly string[]): string {
  const lowered = candidate.toLowerCase();
  const near = known.find((name) => name.startsWith(lowered) || lowered.startsWith(name));
  return near === undefined ? '' : ` Did you mean \`agyp ${near}\`?`;
}

function optionTakesValue(command: AgypCommandSpec, flag: string): boolean {
  return command.options.some(
    (option) => (option.flag === flag || option.alias === flag) && option.argument !== undefined
  );
}

function knownFlag(command: AgypCommandSpec, flag: string): boolean {
  return command.options.some((option) => option.flag === flag || option.alias === flag);
}

function canonicalFlag(command: AgypCommandSpec, flag: string): string {
  const match = command.options.find((option) => option.flag === flag || option.alias === flag);
  return match?.flag ?? flag;
}

/**
 * Parses argv against a command's declared options.
 *
 * Unknown flags are refused rather than ignored: a caller that mistypes an
 * option should hear about it, not silently get default behaviour. That
 * matters most for the non-interactive callers this surface exists for.
 */
export function parseArguments(
  argv: readonly string[],
  resolveDefault: (token: string | undefined) => AgypCommandSpec | undefined
): ParseResult {
  const first = argv[0];
  const explicit = first === undefined ? undefined : findCommand(first);
  const command = explicit ?? resolveDefault(first);

  if (command === undefined) {
    const token = first ?? '';
    return {
      ok: false,
      failure: {
        usageError: `Unknown command "${token}".${suggest(token, ['use', 'list', 'quota', 'best', 'auto', 'doctor'])}`,
      },
    };
  }

  // A bare account query keeps its token; an explicit command consumes it.
  const rest = explicit === undefined && first !== undefined ? [...argv] : argv.slice(1);

  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  let wantsHelp = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }
    if (token === '--help' || token === '-h') {
      wantsHelp = true;
      continue;
    }
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    if (!knownFlag(command, token)) {
      return {
        ok: false,
        failure: { usageError: `Unknown option "${token}" for \`agyp ${command.name}\`.`, command },
      };
    }
    if (!optionTakesValue(command, token)) {
      flags.set(canonicalFlag(command, token), true);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('-')) {
      return {
        ok: false,
        failure: { usageError: `Option "${token}" needs a value.`, command },
      };
    }
    flags.set(canonicalFlag(command, token), value);
    index += 1;
  }

  if (wantsHelp) {
    return { ok: true, parsed: { command, flags, wantsHelp: true } };
  }

  if (positionals.length > 1) {
    return {
      ok: false,
      failure: { usageError: `\`agyp ${command.name}\` takes at most one argument.`, command },
    };
  }

  const argument = positionals[0];
  if (command.argument?.required === true && argument === undefined) {
    return {
      ok: false,
      failure: {
        usageError: `\`agyp ${command.name}\` needs an ${command.argument.name}.`,
        command,
      },
    };
  }
  if (command.argument === undefined && argument !== undefined) {
    return {
      ok: false,
      failure: { usageError: `\`agyp ${command.name}\` takes no arguments.`, command },
    };
  }

  return { ok: true, parsed: { command, argument, flags, wantsHelp: false } };
}

export function readNumericFlag(
  flags: ReadonlyMap<string, string | true>,
  flag: string
): { value?: number; error?: string } {
  const raw = flags.get(flag);
  if (raw === undefined) {
    return {};
  }
  if (raw === true) {
    return { error: `Option "${flag}" needs a value.` };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { error: `Option "${flag}" expects a percentage between 0 and 100, got "${raw}".` };
  }
  return { value };
}
