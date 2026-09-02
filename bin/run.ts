#!/usr/bin/env bun

import ZshrcManager from '../src/commands/index.js';
import {
  registerTerminalSignalTraps,
  restoreTerminalState,
} from '../src/infrastructure/terminal-cleanup';

const unregister = registerTerminalSignalTraps({
  exitOnSignal: true,
  exitCodeOnSignal: 0,
});

try {
  const command = new ZshrcManager([], {});
  await command.run();
  unregister();
  restoreTerminalState();
} catch (error) {
  unregister();
  restoreTerminalState();
  throw error;
}
