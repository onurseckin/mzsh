#!/usr/bin/env bun
import { AgypCli } from '../src/cli/agyp-cli';
import {
  registerTerminalSignalTraps,
  restoreTerminalState,
} from '../src/infrastructure/terminal-cleanup';

const unregister = registerTerminalSignalTraps({
  exitOnSignal: true,
  exitCodeOnSignal: 0,
});

try {
  const cli = new AgypCli();
  const exitCode = await cli.run(process.argv.slice(2));
  unregister();
  restoreTerminalState();
  process.exit(exitCode);
} catch (error: unknown) {
  unregister();
  restoreTerminalState();
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('agyp error:', message);
  process.exit(1);
}
