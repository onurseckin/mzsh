import { describe, expect, test } from 'bun:test';
import { EnvironmentService } from '../../../src/application/environment-service';
import { RedactionService } from '../../../src/application/redaction-service';
import { runMzshCli } from '../../../src/cli/run-cli';
import type { InteractivePrivateEnvironment } from '../../../src/domain/redaction';
import { gatewayRedactionRegistry } from '../../../src/infrastructure/gateway-redaction-registry';

class PrivateEnvironment implements InteractivePrivateEnvironment {
  readonly names = ['SERVICE_TOKEN', 'PUBLIC_LABEL'];
  readonly requestedNames: string[] = [];

  listNames(): readonly string[] {
    return this.names;
  }

  requestSet(name: string): void {
    this.requestedNames.push(name);
  }
}

describe('environment service', () => {
  test('lists and gets environment metadata without returning private values', () => {
    const service = new EnvironmentService(
      new PrivateEnvironment(),
      new RedactionService(gatewayRedactionRegistry)
    );

    expect(service.list()).toEqual([
      { name: 'SERVICE_TOKEN', value: '[REDACTED]' },
      { name: 'PUBLIC_LABEL', value: '[REDACTED]' },
    ]);
    expect(service.get('SERVICE_TOKEN')).toEqual({ name: 'SERVICE_TOKEN', value: '[REDACTED]' });
    expect(JSON.stringify(service.list())).not.toContain('private');
  });

  test('sends only a name to the interactive private boundary for set', () => {
    const boundary = new PrivateEnvironment();
    const service = new EnvironmentService(
      boundary,
      new RedactionService(gatewayRedactionRegistry)
    );

    expect(service.set({ name: 'SERVICE_TOKEN' })).toEqual({
      name: 'SERVICE_TOKEN',
      value: '[REDACTED]',
    });
    expect(boundary.requestedNames).toEqual(['SERVICE_TOKEN']);
  });

  test('renders environment metadata without accepting or writing values', () => {
    const output: string[] = [];
    const setRequests: string[] = [];
    let authorizationRequests = 0;
    const dependencies = {
      home: '/home',
      xdgConfig: '/home/.config',
      xdgCache: '/home/.cache',
      repositoryRoot: '/checkout',
      write: (message: string) => output.push(message),
      environment: {
        list: () => [{ name: 'SERVICE_TOKEN', value: '[REDACTED]' as const }],
        get: () => ({ name: 'SERVICE_TOKEN', value: '[REDACTED]' as const }),
        set: ({ name }: { name: string }) => {
          setRequests.push(name);
          return { name, value: '[REDACTED]' as const };
        },
      },
      authLease: {
        acquire: () => {
          authorizationRequests += 1;
          return { owner: 'local-owner', expiresAt: '2026-08-28T12:00:00.000Z' };
        },
      },
    };

    expect(runMzshCli(['env', 'list', '--json'], dependencies)).toBe(0);
    expect(output[0]).toBe('[{"name":"SERVICE_TOKEN","value":"[REDACTED]"}]');
    output.splice(0);
    expect(runMzshCli(['env', 'set', 'SERVICE_TOKEN'], dependencies)).toBe(0);
    expect(setRequests).toEqual(['SERVICE_TOKEN']);
    expect(authorizationRequests).toBe(1);
    expect(output[0]).not.toContain('private');
  });
});
