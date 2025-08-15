#!/usr/bin/env bun

import ZshrcManager from '../src/commands/index.js';

const command = new ZshrcManager([], {});
await command.run();
