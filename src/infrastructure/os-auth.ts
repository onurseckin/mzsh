import type { OperatingSystemAuthorization } from '../domain/auth';

export type OsAuthorizationPrompt = (owner: string) => boolean;

export class OsAuth implements OperatingSystemAuthorization {
  constructor(private readonly prompt: OsAuthorizationPrompt = () => false) {}

  authorize(owner: string): boolean {
    return this.prompt(owner);
  }
}
