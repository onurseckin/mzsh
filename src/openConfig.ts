import { spawn } from 'node:child_process';

export type OpenType = 'default' | 'vim' | 'nano' | 'code' | 'subl';
type OpenMode = 'terminal' | 'gui';
type OpenPlatform = string;

export interface OpenConfig {
  name: string;
  description: string;
  command?: string;
  mode: OpenMode;
}

export interface OpenInvocation {
  command: string;
  args: string[];
  options: { detached: boolean; stdio: 'inherit' | 'ignore' };
  waitForExit: boolean;
}

export const openConfigs: Record<OpenType, OpenConfig> = {
  default: {
    name: 'Default Application',
    description: 'Opens with the system default application',
    mode: 'gui',
  },
  vim: {
    name: 'Vim',
    description: 'Opens in the current terminal',
    command: 'vim',
    mode: 'terminal',
  },
  nano: {
    name: 'Nano',
    description: 'Opens in the current terminal',
    command: 'nano',
    mode: 'terminal',
  },
  code: {
    name: 'VS Code',
    description: 'Opens in a separate window',
    command: 'code',
    mode: 'gui',
  },
  subl: {
    name: 'Sublime Text',
    description: 'Opens in a separate window',
    command: 'subl',
    mode: 'gui',
  },
};

function defaultCommand(platform: OpenPlatform): string {
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'explorer.exe';
  return 'xdg-open';
}

export function createOpenInvocation(
  filePath: string,
  openType: OpenType,
  platform: OpenPlatform = process.platform
): OpenInvocation {
  const config = openConfigs[openType];
  const waitForExit = config.mode === 'terminal';
  return {
    command: config.command ?? defaultCommand(platform),
    args: [filePath],
    options: waitForExit
      ? { detached: false, stdio: 'inherit' }
      : { detached: true, stdio: 'ignore' },
    waitForExit,
  };
}

export function getAvailableOpenTypes(): OpenType[] {
  return Object.keys(openConfigs) as OpenType[];
}

export function getOpenConfig(type: OpenType): OpenConfig {
  return openConfigs[type];
}

export function isValidOpenType(type: string): type is OpenType {
  return type in openConfigs;
}

export function openFileWithType(
  filePath: string,
  openType: OpenType,
  onSuccess?: (message: string) => void,
  onError?: (message: string) => void
): Promise<void> {
  const config = getOpenConfig(openType);
  const invocation = createOpenInvocation(filePath, openType);

  return new Promise((resolve, reject) => {
    const fail = (message: string) => {
      onError?.(message);
      reject(new Error(message));
    };
    const child = spawn(invocation.command, invocation.args, invocation.options);
    child.once('error', (error) => fail(`Failed to open with ${config.name}: ${error.message}`));

    if (!invocation.waitForExit) {
      child.once('spawn', () => {
        child.unref();
        onSuccess?.(`File opened with ${config.name}.`);
        resolve();
      });
      return;
    }

    child.once('exit', (code) => {
      if (code === 0) {
        onSuccess?.(`File editing completed with ${config.name}.`);
        resolve();
        return;
      }
      fail(`${config.name} exited with code ${code}`);
    });
  });
}
