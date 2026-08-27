import { expect, test } from 'bun:test';
import ZshrcManager, { checkoutLocalCommandLines } from '../../src/index';
import { appMessages } from '../../src/messages/appMessages';
import { installMessages } from '../../src/messages/installMessages';
import { uninstallMessages } from '../../src/messages/uninstallMessages';
import { updateMessages } from '../../src/messages/updateMessages';

test('guides legacy lifecycle callers through the managed reversible workflow', () => {
  expect(appMessages.errors.noConfigFiles.action).toContain('bun run mzsh -- audit');
  expect(appMessages.help.usage).toBe('bun run mzsh -- <command> [OPTIONS]');
  expect(appMessages.help.options.update).toBe(
    'bun run mzsh -- update [--source /absolute/checkout] [--apply]  Plan or apply a local managed update.'
  );
  expect(appMessages.help.options.bootstrap).toBe(
    'bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply]  Plan or apply initial managed-shell adoption.'
  );
  expect(appMessages.help.options.rollback).toBe(
    'bun run mzsh -- rollback receipt-id [--apply]  Restore one recorded adoption transaction.'
  );
  expect(appMessages.help.examples).toEqual([
    'bun run mzsh -- audit [--source /absolute/checkout] [--json]',
    'bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply]',
    'bun run mzsh -- update [--source /absolute/checkout] [--apply]',
    'bun run mzsh -- rollback receipt-id [--apply]',
  ]);
  expect(installMessages.info.starting).toContain('bun run mzsh -- audit');
  expect(updateMessages.errors.updateFailed.action).toContain('bun run mzsh -- update');
  expect(uninstallMessages.errors.stillFound.action).toContain(
    'bun run mzsh -- rollback receipt-id'
  );
  expect(ZshrcManager.examples).toEqual([
    'bun run mzsh -- audit [--source /absolute/checkout] [--json]',
    'bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply]',
    'bun run mzsh -- update [--source /absolute/checkout] [--apply]',
    'bun run mzsh -- rollback receipt-id [--apply]',
  ]);
  expect(checkoutLocalCommandLines).toEqual([
    '  bun run mzsh -- audit [--source /absolute/checkout] [--json]',
    '  bun run mzsh -- bootstrap --source /absolute/checkout [--legacy-source /absolute/file] [--apply]',
    '  bun run mzsh -- update [--source /absolute/checkout] [--apply]',
    '  bun run mzsh -- rollback receipt-id [--apply]',
  ]);
});

test('keeps compatibility messaging free of global reinstall or removal actions', () => {
  expect(Object.keys(appMessages.help.options)).toEqual([
    'openType',
    'update',
    'bootstrap',
    'rollback',
    'help',
  ]);
  expect(Object.keys(updateMessages.errors)).toEqual([
    'updateFailed',
    'bootstrapFailed',
    'repositoryUnavailable',
  ]);
  expect(Object.keys(installMessages.errors)).toEqual([
    'checkoutUnavailable',
    'bunUnavailable',
    'buildFailed',
    'bootstrapFailed',
    'managedStateUnavailable',
  ]);
  expect(Object.values(uninstallMessages.summary.items).join('\n')).not.toMatch(
    /\b(remove|removed|cleaned)\b/i
  );
});
