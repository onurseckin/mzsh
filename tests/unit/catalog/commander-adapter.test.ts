import { describe, expect, test } from 'bun:test';
import { createCommanderAdapter, parseCommanderArgs } from '../../../src/catalog/commander-adapter';
import { runMzshCli, type RunMzshCliDependencies } from '../../../src/cli/run-cli';

describe('Commander catalog adapter', () => {
  test('delegates managed parsing to the catalog', () => {
    expect(parseCommanderArgs(['update', '--source', '/checkout', '--apply'])).toEqual({
      kind: 'update',
      source: '/checkout',
      apply: true,
    });
  });

  test('formats catalog help without defining a second command grammar', () => {
    const adapter = createCommanderAdapter();

    expect(adapter.help()).toContain(
      'bootstrap --source absolute-path [--legacy-source absolute-path] [--apply]'
    );
    expect(adapter.help('rollback')).toContain('Risk: destructive');
  });

  test('returns an unavailable placeholder before accessing managed command dependencies', () => {
    const output: string[] = [];
    const dependencies: RunMzshCliDependencies = {
      get home(): string {
        throw new Error('home must not be accessed');
      },
      get xdgConfig(): string {
        throw new Error('xdgConfig must not be accessed');
      },
      get xdgCache(): string {
        throw new Error('xdgCache must not be accessed');
      },
      get repositoryRoot(): string {
        throw new Error('repositoryRoot must not be accessed');
      },
      write: (message) => output.push(message),
    };

    expect(runMzshCli(['setup'], dependencies)).toBe(2);
    expect(output).toEqual(['MZSH_USAGE_command-unavailable']);
  });
});
