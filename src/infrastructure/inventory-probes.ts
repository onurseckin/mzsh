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
    if (input.categoryId !== undefined && input.categoryId !== 'runtimes') return [];
    const result = this.processRunner.run(['bun', '--version']);
    if (result.status !== 0) {
      return [{ categoryId: 'runtimes', name: 'bun', status: 'absent', origin: 'path' }];
    }
    const version = versionFromOutput(result.output);
    return [
      {
        categoryId: 'runtimes',
        name: 'bun',
        status: 'present',
        origin: 'path',
        ...(version === undefined ? {} : { version }),
      },
    ];
  }
}
