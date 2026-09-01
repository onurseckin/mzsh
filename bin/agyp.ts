#!/usr/bin/env bun
import { AgypCli } from '../src/cli/agyp-cli';

try {
  const cli = new AgypCli();
  const exitCode = await cli.run(process.argv.slice(2));
  process.exit(exitCode);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('agyp error:', message);
  process.exit(1);
}
