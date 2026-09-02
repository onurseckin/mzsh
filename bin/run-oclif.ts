#!/usr/bin/env bun

import { run } from '@oclif/core';
import {
  registerTerminalSignalTraps,
  restoreTerminalState,
} from '../src/infrastructure/terminal-cleanup';

const unregister = registerTerminalSignalTraps({
  exitOnSignal: true,
  exitCodeOnSignal: 0,
});

try {
  await run();
  unregister();
  restoreTerminalState();
} catch (error) {
  unregister();
  restoreTerminalState();
  throw error;
}
