#!/usr/bin/env bun

// Production runner - uses built version if available, falls back to source
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);
const projectRoot: string = join(__dirname, '..');
const builtFile: string = join(projectRoot, 'dist', 'index.js');
const sourceFile: string = join(projectRoot, 'src', 'commands', 'index.ts');

interface ZshrcManagerConstructor {
  new (
    _argv: string[],
    _config: object
  ): {
    run(): Promise<void>;
  };
}

let ZshrcManager: ZshrcManagerConstructor;

if (existsSync(builtFile)) {
  // Use built version for better performance
  const module = await import(builtFile);
  ZshrcManager = module.default;
} else {
  // Fall back to source version for development
  const module = await import(sourceFile);
  ZshrcManager = module.default;
}

const command = new ZshrcManager(process.argv.slice(2), {});
await command.run();
