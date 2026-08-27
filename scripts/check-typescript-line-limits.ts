import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DEFAULT_MAXIMUM_LINES = 400;
export const TYPE_SCRIPT_DIRECTORIES = ['bin', 'scripts', 'src', 'tests'];
export const ROOT_TYPE_SCRIPT_FILES = ['index.ts'];

export type TypeScriptLineLimitViolation = {
  path: string;
  lines: number;
};

function countPhysicalLines(path: string): number {
  const bytes = readFileSync(path);
  if (bytes.length === 0) {
    return 0;
  }

  let lines = 0;
  for (const byte of bytes) {
    if (byte === 10) {
      lines += 1;
    }
  }

  return bytes.at(-1) === 10 ? lines : lines + 1;
}

function collectRegularTypeScriptFiles(root: string, directory: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...collectRegularTypeScriptFiles(root, path));
      continue;
    }

    if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.ts')) {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }

  return files;
}

function isRegularTypeScriptFile(path: string): boolean {
  const metadata = lstatSync(path);
  return metadata.isFile() && !metadata.isSymbolicLink() && path.endsWith('.ts');
}

export function collectTypeScriptLineLimitViolations(
  root: string,
  maximumLines = DEFAULT_MAXIMUM_LINES
): TypeScriptLineLimitViolation[] {
  const files = [
    ...ROOT_TYPE_SCRIPT_FILES.filter((file) => isRegularTypeScriptFile(join(root, file))),
    ...TYPE_SCRIPT_DIRECTORIES.flatMap((directory) =>
      collectRegularTypeScriptFiles(root, join(root, directory))
    ),
  ].sort((left, right) => left.localeCompare(right));

  return files.flatMap((file) => {
    const lines = countPhysicalLines(join(root, file));
    return lines > maximumLines ? [{ path: file, lines }] : [];
  });
}

function formatViolations(violations: TypeScriptLineLimitViolation[]): string {
  return violations.map((violation) => `- ${violation.path}: ${violation.lines}`).join('\n');
}

if (import.meta.main) {
  const root = process.cwd();
  const violations = collectTypeScriptLineLimitViolations(root);
  if (violations.length > 0) {
    console.error(
      `TypeScript physical-line limit (400) exceeded:\n${formatViolations(violations)}`
    );
    process.exitCode = 1;
  }
}
