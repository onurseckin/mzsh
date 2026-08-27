import { expect, test } from 'bun:test';

test('contains no bare actionable managed commands in repository guidance', () => {
  const result = Bun.spawnSync(
    [
      'rg',
      '-n',
      '--hidden',
      '--glob',
      '!node_modules/**',
      '--glob',
      '!bun.lock',
      '\\bmzsh (audit|bootstrap|update|rollback)',
      '.',
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );

  expect(result.exitCode).toBe(1);
  expect(new TextDecoder().decode(result.stdout)).toBe('');
  expect(new TextDecoder().decode(result.stderr)).toBe('');
});
