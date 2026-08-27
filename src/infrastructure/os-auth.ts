import { spawnSync } from 'node:child_process';
import type { OperatingSystemAuthorization } from '../domain/auth';

export type OsAuthorizationPrompt = (owner: string) => boolean;

function requestSystemAuthorization(): boolean {
  if (process.platform !== 'darwin') return false;
  return (
    spawnSync(
      '/usr/bin/osascript',
      ['-e', 'do shell script "true" with administrator privileges'],
      {
        stdio: 'ignore',
      }
    ).status === 0
  );
}

export class OsAuth implements OperatingSystemAuthorization {
  constructor(
    private readonly prompt: OsAuthorizationPrompt = () => requestSystemAuthorization()
  ) {}

  authorize(owner: string): boolean {
    return this.prompt(owner);
  }
}
