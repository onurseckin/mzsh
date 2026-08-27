export const legacyUninstallGuidance = [
  'MZSH legacy uninstallation is retired.',
  'Run: bun run mzsh -- audit',
  'Then: bun run mzsh -- rollback receipt-id',
] as const;

type LegacyLifecycleWriter = (message: string) => void;

/**
 * Compatibility adapter retained for older callers. Removal is intentionally
 * receipt-scoped and explicit, never a package or home-directory cleanup.
 */
export class SelfUninstaller {
  constructor(private readonly write: LegacyLifecycleWriter = console.log) {}

  async runUninstall(): Promise<void> {
    for (const message of legacyUninstallGuidance) this.write(message);
  }
}
