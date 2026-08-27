import { describe, expect, test } from 'bun:test';
import { createCommanderAdapter, parseCommanderArgs } from '../../../src/catalog/commander-adapter';

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
});
