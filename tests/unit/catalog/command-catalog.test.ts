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

  test('lists product commands and routes inventory through catalog parsing', () => {
    expect(catalog.commands.map((command) => command.name)).toEqual([
      'audit',
      'bootstrap',
      'update',
      'rollback',
      'setup',
      'history',
      'inventory',
      'env',
      'dag',
      'tui',
    ]);
    expect(parseCatalogArgs(['setup'])).toEqual({ kind: 'setup', apply: false });
    expect(parseCatalogArgs(['inventory', 'runtimes', '--json'])).toEqual({
      kind: 'inventory',
      categoryId: 'runtimes',
      json: true,
    });
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

  test('requires review confirmation flags for setup through the catalog grammar', () => {
    expect(catalog.require('setup').available).toBe(true);
    expect(parseCatalogArgs(['setup', '--apply'])).toEqual({
      kind: 'setup',
      apply: true,
    });
  });

  test('routes environment operations without accepting a value argument', () => {
    expect(catalog.require('env').available).toBe(true);
    expect(parseCatalogArgs(['env', 'list', '--json'])).toEqual({
      kind: 'env',
      action: 'list',
      json: true,
    });
    expect(parseCatalogArgs(['env', 'get', 'SERVICE_TOKEN'])).toEqual({
      kind: 'env',
      action: 'get',
      name: 'SERVICE_TOKEN',
      json: false,
    });
    expect(parseCatalogArgs(['env', 'set', 'SERVICE_TOKEN'])).toEqual({
      kind: 'env',
      action: 'set',
      name: 'SERVICE_TOKEN',
      json: false,
    });
    expect(parseCatalogArgs(['env', 'set', 'SERVICE_TOKEN', 'private'])).toEqual({
      kind: 'usage-error',
      code: 'unexpected-positional',
    });
    expect(renderCatalogHelp('audit')).toContain('Render the audit report as JSON.');
    expect(renderCatalogHelp('inventory')).toContain('Render inventory metadata as JSON.');
    expect(renderCatalogHelp('env')).toContain('Render redacted environment metadata as JSON.');
  });
});
