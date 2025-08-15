#!/usr/bin/env bun

// Standalone runner that works independently
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);

// Try to find the built command file
const possiblePaths: string[] = [
  // When installed globally - try lib first (compiled TS), then dist (bundled)
  join(__dirname, '..', 'lib', 'index.js'),
  join(__dirname, '..', 'dist', 'index.js'),
  // When running from project directory
  join(__dirname, '..', 'src', 'index.ts'),
];

let ZshrcManager: { new (_argv: string[], _config: object): { run(): Promise<void> } };
let commandPath: string | undefined;

for (const path of possiblePaths) {
  if (existsSync(path)) {
    commandPath = path;
    break;
  }
}

if (!commandPath) {
  console.error('Error: Could not find mzsh command files');
  process.exit(1);
}

try {
  const module = await import(commandPath);
  ZshrcManager = module.default || module.ZshrcManager || module;

  if (typeof ZshrcManager !== 'function') {
    console.error('Error: ZshrcManager is not a constructor function');
    console.error('Available exports:', Object.keys(module));
    process.exit(1);
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error loading mzsh:', errorMessage);
  process.exit(1);
}

// Create and run the command
try {
  const command = new ZshrcManager(process.argv.slice(2), {
    root: dirname(commandPath),
    name: 'mzsh',
    version: '1.0.0',
  });
  await command.run();
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error running command:', errorMessage);
  process.exit(1);
}
