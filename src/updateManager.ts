export const legacyUpdateGuidance = [
  'MZSH legacy update is retired.',
  'Run: bun run mzsh -- audit',
  'Then: bun run mzsh -- update --source /absolute/mzsh-checkout',
] as const;

type LegacyLifecycleWriter = (message: string) => void;

/**
 * Compatibility adapter retained for older callers. Updates now require the
 * receipt-backed local managed workflow, so this entrypoint never mutates host
 * files, package links, or checkout state.
 */
export class UpdateManager {
  constructor(private readonly write: LegacyLifecycleWriter = console.log) {}

  async runUpdate(): Promise<void> {
    for (const message of legacyUpdateGuidance) this.write(message);
  }
}
