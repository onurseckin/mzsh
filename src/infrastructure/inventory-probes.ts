import { spawnSync } from 'node:child_process';
import type {
  InventoryCollectionInput,
  InventoryProvider,
  InventoryRecord,
} from '../domain/inventory';

export interface ProcessRunResult {
  status: number | null;
  output: string;
}

export interface ProcessRunner {
  run(argv: readonly string[]): ProcessRunResult;
}

class FixedArgvProcessRunner implements ProcessRunner {
  run(argv: readonly string[]): ProcessRunResult {
    const command = argv[0];
    if (command === undefined) return { status: 1, output: '' };
    const result = spawnSync(command, argv.slice(1), {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }
}

function versionFromOutput(output: string): string | undefined {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

export class InventoryProbes implements InventoryProvider {
  constructor(private readonly processRunner: ProcessRunner = new FixedArgvProcessRunner()) {}

  collect(input: InventoryCollectionInput): readonly InventoryRecord[] {
    const records: InventoryRecord[] = [];

    const runtimes = [
      { name: 'bun', cmd: ['bun', '--version'] },
      { name: 'node', cmd: ['node', '--version'] },
      { name: 'python', cmd: ['python', '--version'] },
      { name: 'ruby', cmd: ['ruby', '-v'] },
      { name: 'go', cmd: ['go', 'version'] },
      { name: 'rust', cmd: ['rustc', '--version'] },
      { name: 'java', cmd: ['java', '-version'] },
    ];

    if (input.categoryId === undefined || input.categoryId === 'runtimes') {
      for (const rt of runtimes) {
        const res = this.processRunner.run(rt.cmd);
        if (res.status === 0) {
          const version = versionFromOutput(res.output);
          records.push({
            categoryId: 'runtimes',
            name: rt.name,
            status: 'present',
            origin: 'path',
            ...(version ? { version } : {}),
          });
        } else {
          records.push({ categoryId: 'runtimes', name: rt.name, status: 'absent', origin: 'path' });
        }
      }
    }

    if (input.categoryId === undefined || input.categoryId === 'managers') {
      const res = this.processRunner.run(['brew', '--version']);
      if (res.status === 0) {
        const version = versionFromOutput(res.output);
        records.push({
          categoryId: 'managers',
          name: 'homebrew',
          status: 'present',
          origin: 'path',
          ...(version ? { version } : {}),
        });
      } else {
        records.push({
          categoryId: 'managers',
          name: 'homebrew',
          status: 'absent',
          origin: 'path',
        });
      }
    }

    if (input.categoryId === undefined || input.categoryId === 'applications') {
      records.push({
        categoryId: 'applications',
        name: 'macos-apps',
        status: 'present',
        origin: 'path',
      });
    }

    if (input.categoryId === undefined || input.categoryId === 'scripts') {
      records.push({ categoryId: 'scripts', name: 'cli-tools', status: 'present', origin: 'path' });
    }

    return records;
  }
}
