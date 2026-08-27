import { afterEach, describe, expect, test } from 'bun:test';
import * as helpers from './adoption-transaction-test-helpers';

const {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  join,
  applyAdoption,
  planAdoption,
  NodeAdoptionFilesystem,
  passingPreflight,
  fixture,
  repository,
  home,
  input,
} = helpers;
afterEach(helpers.cleanupFixtures);

describe('adoption transaction failures', () => {
  test('re-plans an already managed topology idempotently', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const first = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-9',
    });
    if (first.kind !== 'ready') throw new Error('expected plan');
    expect(
      applyAdoption(first.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      }).kind
    ).toBe('applied');
    const second = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-10',
    });
    expect(second).toEqual(expect.objectContaining({ kind: 'ready' }));
  });

  test('preserves the existing home mode and performs injected preflight before any write', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    chmodSync(homeRoot, 0o755);
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-preflight',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: () => ({ kind: 'failed', code: 'isolated-startup-failed' }),
      })
    ).toEqual(
      expect.objectContaining({
        kind: 'failed',
        stage: 'preflight',
        code: 'isolated-startup-failed',
      })
    );
    expect(lstatSync(homeRoot).mode & 0o777).toBe(0o755);
    expect(() => lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-preflight'))).toThrow();
  });

  test('fails closed when preflight is missing or throws', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-missing-preflight',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(applyAdoption(planned.plan, { filesystem: new NodeAdoptionFilesystem() })).toEqual(
      expect.objectContaining({ kind: 'failed', stage: 'preflight', code: 'preflight-unavailable' })
    );
    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: () => {
          throw new Error('injected');
        },
      })
    ).toEqual(
      expect.objectContaining({ kind: 'failed', stage: 'preflight', code: 'preflight-unavailable' })
    );
    expect(() =>
      lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-missing-preflight'))
    ).toThrow();
  });

  test('fails apply when repository entrypoint or metadata changes after planning', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-repository',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');
    writeFileSync(join(repositoryRoot, 'portable', 'zsh', 'init.zsh'), 'changed\n');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      })
    ).toEqual(
      expect.objectContaining({ kind: 'failed', stage: 'preflight', code: 'repository-changed' })
    );
  });

  test('retains unsafe non-selected legacy syntax but rejects an unsafe selected line', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const legacy = join(homeRoot, 'legacy.zsh');
    writeFileSync(
      legacy,
      'export PATH=$(safe-retained-command)\nexport MZSH_API_TOKEN=inert-placeholder\n'
    );
    const retained = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-retained',
      isSensitiveAssignment: (line) => line.startsWith('export MZSH_API_TOKEN='),
    });
    expect(retained).toEqual(expect.objectContaining({ kind: 'ready' }));
    const unsafeSelected = planAdoption(input(homeRoot, repositoryRoot, legacy), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-unsafe',
      isSensitiveAssignment: (line) => line.startsWith('export PATH='),
    });
    expect(unsafeSelected).toEqual(
      expect.objectContaining({ kind: 'rejected', code: 'legacy-selected-unsafe' })
    );
  });

  test('does not follow a hostile temporary symlink and removes a receipt after post-publication failure', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    const victim = join(root, 'victim');
    writeFileSync(victim, 'victim-before\n');
    symlinkSync(victim, join(homeRoot, '..zshenv.hostile.mzsh-tmp'));
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-hostile',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(() => 'hostile'),
        preflight: passingPreflight,
      })
    ).toEqual(expect.objectContaining({ kind: 'failed', code: 'mutation-failed' }));
    expect(readFileSync(victim, 'utf8')).toBe('victim-before\n');

    const second = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-publication',
    });
    if (second.kind !== 'ready') throw new Error('expected plan');
    expect(
      applyAdoption(second.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
        failAfterReceiptPublication: () => true,
      })
    ).toEqual(expect.objectContaining({ kind: 'failed', code: 'mutation-failed' }));
    expect(() =>
      lstatSync(join(homeRoot, '.config', 'mzsh', 'state', 'tx-publication', 'receipt.json'))
    ).toThrow();
  });

  test('keeps existing parent permissions and writes quiet guarded loader sources', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    chmodSync(homeRoot, 0o755);
    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-loader',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');

    expect(
      applyAdoption(planned.plan, {
        filesystem: new NodeAdoptionFilesystem(),
        preflight: passingPreflight,
      }).kind
    ).toBe('applied');
    const loader = readFileSync(join(homeRoot, '.zshrc'), 'utf8');
    expect(lstatSync(homeRoot).mode & 0o777).toBe(0o755);
    expect(loader).toContain('[[ ! -r');
    expect(loader).toContain('"mzsh: managed loader unavailable"');
    expect(loader).not.toContain(homeRoot);
    expect(loader).not.toContain(repositoryRoot);
  });

  test('converts metadata failures and post-rename failures into safe transaction results', () => {
    const root = fixture();
    const repositoryRoot = repository(root);
    const homeRoot = home(root);
    class ThrowingDescribeFilesystem extends NodeAdoptionFilesystem {
      override describe(): never {
        throw new Error('injected metadata failure');
      }
    }
    expect(
      planAdoption(input(homeRoot, repositoryRoot), {
        filesystem: new ThrowingDescribeFilesystem(),
        id: () => 'tx-metadata',
      })
    ).toEqual(expect.objectContaining({ kind: 'rejected', code: 'metadata-unavailable' }));

    const planned = planAdoption(input(homeRoot, repositoryRoot), {
      filesystem: new NodeAdoptionFilesystem(),
      id: () => 'tx-rename',
    });
    if (planned.kind !== 'ready') throw new Error('expected plan');
    const recreatedTemp = join(homeRoot, '..zshenv.race.mzsh-tmp');
    class PostRenameFailureFilesystem extends NodeAdoptionFilesystem {
      override writeAtomic(path: string, content: string | Uint8Array, mode?: number): void {
        super.writeAtomic(path, content, mode);
        if (path.endsWith('.zshenv')) {
          writeFileSync(recreatedTemp, 'other-actor\n');
          throw new Error('injected post-rename failure');
        }
      }
    }
    expect(
      applyAdoption(planned.plan, {
        filesystem: new PostRenameFailureFilesystem(() => 'race'),
        preflight: passingPreflight,
      })
    ).toEqual(expect.objectContaining({ kind: 'failed', code: 'mutation-failed' }));
    expect(readFileSync(recreatedTemp, 'utf8')).toBe('other-actor\n');
    expect(() => lstatSync(join(homeRoot, '.zshenv'))).toThrow();
  });

  test('backs up and restores non-UTF8 file bytes exactly', () => {
    const root = fixture();
    const source = join(root, 'binary-source');
    const backupDirectory = join(root, 'backup');
    const backup = join(backupDirectory, 'source');
    mkdirSync(backupDirectory);
    writeFileSync(source, new Uint8Array([0xff, 0x00, 0xfe, 0x41]));
    const filesystem = new NodeAdoptionFilesystem();
    const state = filesystem.describe(source);
    filesystem.backup(state, backup);
    writeFileSync(source, 'changed\n');
    filesystem.restore(state, backup);
    expect([...readFileSync(source)]).toEqual([0xff, 0x00, 0xfe, 0x41]);
  });
});
