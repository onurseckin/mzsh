import { describe, expect, test } from 'bun:test';
import {
  catalog,
  parseCatalogArgs,
  renderCatalogHelp,
  renderCatalogUsage,
} from '../../../src/catalog/command-catalog';

describe('dag catalog integration', () => {
  test('registers dag command in catalog with correct metadata', () => {
    const entry = catalog.require('dag');

    expect(entry.name).toBe('dag');
    expect(entry.risk).toBe('read-only');
    expect(entry.available).toBe(true);
    expect(entry.summary).toContain('dependency graphs');
    expect(entry.palette.keywords).toContain('dag');
    expect(entry.palette.keywords).toContain('workflow');
    expect(entry.tui.keys).toEqual(['space', 'g']);
  });

  test('parses basic dag command with defaults', () => {
    expect(parseCatalogArgs(['dag'])).toEqual({
      kind: 'dag',
      json: false,
    });
  });

  test('parses positional workflow argument', () => {
    expect(parseCatalogArgs(['dag', 'mzsh-ci-pipeline'])).toEqual({
      kind: 'dag',
      workflow: 'mzsh-ci-pipeline',
      json: false,
    });
  });

  test('parses --workflow flag option', () => {
    expect(parseCatalogArgs(['dag', '--workflow', 'mzsh-audit-fix'])).toEqual({
      kind: 'dag',
      workflow: 'mzsh-audit-fix',
      json: false,
    });
  });

  test('parses format flags: box, tree, compact', () => {
    expect(parseCatalogArgs(['dag', '--format', 'box'])).toEqual({
      kind: 'dag',
      format: 'box',
      json: false,
    });
    expect(parseCatalogArgs(['dag', '--format', 'tree'])).toEqual({
      kind: 'dag',
      format: 'tree',
      json: false,
    });
    expect(parseCatalogArgs(['dag', '--format', 'compact'])).toEqual({
      kind: 'dag',
      format: 'compact',
      json: false,
    });
  });

  test('parses --critical-path boolean flag', () => {
    expect(parseCatalogArgs(['dag', '--critical-path'])).toEqual({
      kind: 'dag',
      criticalPath: true,
      json: false,
    });
  });

  test('parses --simulate boolean flag', () => {
    expect(parseCatalogArgs(['dag', '--simulate'])).toEqual({
      kind: 'dag',
      simulate: true,
      json: false,
    });
  });

  test('parses --filter status flag', () => {
    expect(parseCatalogArgs(['dag', '--filter', 'completed'])).toEqual({
      kind: 'dag',
      filter: 'completed',
      json: false,
    });
  });

  test('parses --json boolean flag', () => {
    expect(parseCatalogArgs(['dag', '--json'])).toEqual({
      kind: 'dag',
      json: true,
    });
  });

  test('parses combination of flags and positional argument', () => {
    expect(
      parseCatalogArgs([
        'dag',
        'mzsh-bootstrap',
        '--format',
        'tree',
        '--critical-path',
        '--simulate',
        '--filter',
        'running',
        '--json',
      ])
    ).toEqual({
      kind: 'dag',
      workflow: 'mzsh-bootstrap',
      format: 'tree',
      criticalPath: true,
      simulate: true,
      filter: 'running',
      json: true,
    });
  });

  test('returns error for invalid format value', () => {
    expect(parseCatalogArgs(['dag', '--format', 'invalid-format'])).toEqual({
      kind: 'usage-error',
      code: 'invalid-flags',
    });
  });

  test('returns error for multiple positional arguments', () => {
    expect(parseCatalogArgs(['dag', 'wf1', 'wf2'])).toEqual({
      kind: 'usage-error',
      code: 'unexpected-positional',
    });
  });

  test('renders dag usage and help text', () => {
    const usage = renderCatalogUsage('dag', 'help');
    expect(usage).toContain('dag [workflow]');
    expect(usage).toContain('[--format <box|tree|compact>]');
    expect(usage).toContain('[--critical-path]');
    expect(usage).toContain('[--simulate]');
    expect(usage).toContain('[--filter <status>]');
    expect(usage).toContain('[--json]');

    const help = renderCatalogHelp('dag');
    expect(help).toContain(usage);
    expect(help).toContain('Risk: read-only');
  });
});
