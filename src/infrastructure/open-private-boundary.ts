import { spawn } from 'node:child_process';
import { createOpenInvocation } from '../openConfig';
import type { OpenPrivateBoundary } from './owner-only-private-environment';

export const openPrivateBoundary: OpenPrivateBoundary = (path) => {
  const invocation = createOpenInvocation(path, 'default');
  const child = spawn(invocation.command, invocation.args, invocation.options);
  child.once('error', () => undefined);
  if (!invocation.waitForExit) child.unref();
};
