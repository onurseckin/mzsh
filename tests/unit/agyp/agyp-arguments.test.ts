import { describe, expect, test } from 'bun:test';
import { parseArguments, readNumericFlag } from '../../../src/cli/agyp-arguments';
import { findCommand } from '../../../src/cli/agyp-commands';

const resolveDefault = (token: string | undefined) =>
  token === undefined || token.startsWith('-') ? findCommand('menu') : findCommand('use');

function parse(argv: string[]) {
  return parseArguments(argv, resolveDefault);
}

describe('command resolution', () => {
  test('a bare account query becomes use, keeping the token', () => {
    const result = parse(['work@example.com']);
    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.parsed.command.name).toBe('use');
      expect(result.parsed.argument).toBe('work@example.com');
    }
  });

  test('no arguments opens the menu', () => {
    const result = parse([]);
    expect(result.ok && result.parsed.command.name).toBe('menu');
  });

  test('aliases resolve to their command', () => {
    expect(parse(['ls']).ok && findCommand('ls')?.name).toBe('list');
    expect(findCommand('whoami')?.name).toBe('current');
    expect(findCommand('rm')?.name).toBe('logout');
  });
});

describe('flag parsing', () => {
  test('accepts a declared boolean flag', () => {
    const result = parse(['list', '--json']);
    expect(result.ok && result.parsed.flags.get('--json')).toBe(true);
  });

  test('accepts a declared value flag', () => {
    const result = parse(['auto', '--min', '25']);
    expect(result.ok && result.parsed.flags.get('--min')).toBe('25');
  });

  test('refuses an undeclared flag rather than ignoring it', () => {
    // A caller that mistypes an option must hear about it instead of
    // silently getting default behaviour.
    const result = parse(['list', '--refrsh']);
    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.failure.usageError).toContain('--refrsh');
      expect(result.failure.command?.name).toBe('list');
    }
  });

  test('refuses a value flag with no value', () => {
    const result = parse(['auto', '--min']);
    expect(result.ok).toBeFalse();
  });

  test('refuses a value flag followed by another flag', () => {
    const result = parse(['auto', '--min', '--json']);
    expect(result.ok).toBeFalse();
  });

  test('treats --help as a help request for the command', () => {
    const result = parse(['auto', '--help']);
    expect(result.ok && result.parsed.wantsHelp).toBeTrue();
    expect(result.ok && result.parsed.command.name).toBe('auto');
  });

  test('-h is accepted anywhere', () => {
    expect(parse(['quota', '-h']).ok).toBeTrue();
  });
});

describe('argument validation', () => {
  test('refuses a missing required argument', () => {
    const result = parse(['global']);
    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.failure.usageError).toContain('needs an account');
    }
  });

  test('refuses an argument a command does not take', () => {
    const result = parse(['doctor', 'extra']);
    expect(result.ok).toBeFalse();
  });

  test('refuses more than one argument', () => {
    const result = parse(['use', 'one', 'two']);
    expect(result.ok).toBeFalse();
  });

  test('allows an optional argument to be omitted', () => {
    expect(parse(['quota']).ok).toBeTrue();
    expect(parse(['sync']).ok).toBeTrue();
  });
});

describe('readNumericFlag', () => {
  test('reads a percentage', () => {
    expect(readNumericFlag(new Map([['--min', '25']]), '--min').value).toBe(25);
  });

  test('reports a non-numeric value', () => {
    expect(readNumericFlag(new Map([['--min', 'abc']]), '--min').error).toContain('percentage');
  });

  test('rejects a value outside 0-100', () => {
    expect(readNumericFlag(new Map([['--min', '150']]), '--min').error).toBeDefined();
  });

  test('returns nothing when the flag is absent', () => {
    expect(readNumericFlag(new Map(), '--min')).toEqual({});
  });
});
