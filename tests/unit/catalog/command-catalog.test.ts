import { describe, expect, test } from 'bun:test';
import {
  catalog,
  parseCatalogArgs,
  renderCatalogHelp,
  renderCatalogUsage,
} from '../../../src/catalog/command-catalog';
import { renderZshCompletion } from '../../../src/catalog/completion';

describe('command catalog', () => {
  test('uses one catalog entry to parse and describe destructive rollback', () => {
    const entry = catalog.require('rollback');

    expect(entry.risk).toBe('destructive');
    expect(
      parseCatalogArgs([
        'rollback',
        'r1',
        '--apply',
        '--plan-id',
        '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
        '--confirm',
        'APPLY',
      ])
    ).toEqual({
      kind: 'rollback',
      receiptId: 'r1',
      apply: true,
      planId: '4b5fd2fd-2f80-4ce9-a8f3-5c12dfacbe49',
      confirmation: 'APPLY',
    });
    expect(renderCatalogHelp('rollback')).toContain('--plan-id reviewed-plan-id');
  });

  test('preserves managed parser safety errors from catalog flag grammar', () => {
    expect(parseCatalogArgs(['bootstrap', '--source', 'relative'])).toEqual({
      kind: 'usage-error',
      code: 'absolute-path-required',
    });
    expect(parseCatalogArgs(['rollback', '../escape'])).toEqual({
      kind: 'usage-error',
      code: 'receipt-id-invalid',
    });
    expect(parseCatalogArgs(['audit', '--apply'])).toEqual({
      kind: 'usage-error',
      code: 'invalid-flags',
    });
    expect(parseCatalogArgs(['bootstrap', '--source', '/checkout', '--apply', '--apply'])).toEqual({
      kind: 'usage-error',
      code: 'invalid-flags',
    });
    expect(parseCatalogArgs(['audit', '--json', '--json'])).toEqual({
      kind: 'usage-error',
      code: 'invalid-flags',
    });
    expect(
      parseCatalogArgs(['bootstrap', '--source', '/checkout', '--source', 'relative'])
    ).toEqual({
      kind: 'usage-error',
      code: 'absolute-path-required',
    });
    expect(parseCatalogArgs(['bootstrap', '--source', '/checkout', '--source', '/other'])).toEqual({
      kind: 'usage-error',
      code: 'duplicate-flag',
    });
  });

  test('lists future product commands without making them executable', () => {
    expect(catalog.commands.map((command) => command.name)).toEqual([
      'audit',
      'bootstrap',
      'update',
      'rollback',
      'setup',
      'history',
      'inventory',
      'env',
      'tui',
    ]);
    expect(parseCatalogArgs(['setup'])).toEqual({ kind: 'catalog-placeholder', command: 'setup' });
  });

  test('renders completion candidates from the command catalog', () => {
    const completion = renderZshCompletion();

    expect(completion).toContain('rollback');
    expect(completion).toContain('--apply');
    expect(completion).toContain('inventory');
    expect(completion).toContain('--legacy-source');
  });

  test('derives help and checkout usage from the bootstrap flag grammar', () => {
    expect(renderCatalogUsage('bootstrap', 'help')).toBe(
      'bootstrap --source absolute-path [--legacy-source absolute-path] [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]'
    );
    expect(renderCatalogUsage('bootstrap', 'checkout')).toBe(
      'bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply] [--plan-id reviewed-plan-id] [--confirm APPLY]'
    );
    expect(renderCatalogHelp('bootstrap')).toContain(renderCatalogUsage('bootstrap', 'help'));
  });

  test('keeps placeholder flags unavailable through the same catalog grammar', () => {
    expect(catalog.require('setup').parser.flags).toEqual([]);
    expect(parseCatalogArgs(['setup', '--apply'])).toEqual({
      kind: 'usage-error',
      code: 'invalid-flags',
    });
  });
});
