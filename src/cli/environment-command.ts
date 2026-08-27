import type { ManagedCommand } from '../catalog/types';
import {
  isEnvironmentName,
  redactedValue,
  type RedactedEnvironmentRecord,
} from '../domain/redaction';
import type { RunMzshCliDependencies } from './run-cli';

type EnvironmentCommand = Extract<ManagedCommand, { kind: 'env' }>;

function project(
  value: RedactedEnvironmentRecord | undefined
): RedactedEnvironmentRecord | undefined {
  if (value === undefined || !isEnvironmentName(value.name)) return undefined;
  return { name: value.name, value: redactedValue };
}

function write(
  dependencies: RunMzshCliDependencies,
  records: readonly RedactedEnvironmentRecord[],
  json: boolean
): number {
  if (json) dependencies.write(JSON.stringify(records));
  else for (const record of records) dependencies.write(`${record.name} ${record.value}`);
  return 0;
}

export function runEnvironmentCommand(
  command: EnvironmentCommand,
  dependencies: RunMzshCliDependencies
): number {
  const environment = dependencies.environment;
  if (environment === undefined) {
    dependencies.write('MZSH_ENVIRONMENT_PRIVATE_BOUNDARY_REQUIRED');
    return 1;
  }
  if (command.action === 'list') {
    const records = environment.list().flatMap((record) => {
      const projected = project(record);
      return projected === undefined ? [] : [projected];
    });
    return write(dependencies, records, command.json);
  }
  if (command.action === 'get') {
    const record = project(environment.get(command.name));
    if (record === undefined) {
      dependencies.write('MZSH_ENVIRONMENT_ENTRY_UNAVAILABLE');
      return 1;
    }
    return write(dependencies, [record], command.json);
  }
  if (dependencies.authLease === undefined) {
    dependencies.write('MZSH_OS_AUTHORIZATION_REQUIRED');
    return 1;
  }
  try {
    dependencies.authLease.acquire();
  } catch {
    dependencies.write('MZSH_OS_AUTHORIZATION_REQUIRED');
    return 1;
  }
  const record = project(environment.set({ name: command.name }));
  if (record === undefined) {
    dependencies.write('MZSH_ENVIRONMENT_ENTRY_UNAVAILABLE');
    return 1;
  }
  return write(dependencies, [record], false);
}
