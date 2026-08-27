import { expect, test } from 'bun:test';
import { UpdateManager, legacyUpdateGuidance } from '../src/updateManager';
import { SelfUninstaller, legacyUninstallGuidance } from '../src/selfUninstaller';

test('legacy compatibility entrypoints only emit fixed managed migration guidance', async () => {
  const updateOutput: string[] = [];
  const uninstallOutput: string[] = [];

  await new UpdateManager((message) => updateOutput.push(message)).runUpdate();
  await new SelfUninstaller((message) => uninstallOutput.push(message)).runUninstall();

  expect(updateOutput).toEqual(legacyUpdateGuidance);
  expect(uninstallOutput).toEqual(legacyUninstallGuidance);
});
