import { ChildProcess, spawn } from 'child_process';

export type OpenType = 'default' | 'vim' | 'nano' | 'code' | 'subl';

export interface CommandResult {
  command: string;
  args: string[];
}

// Default command function implementation
const createDefaultCommand = (filePath: string): CommandResult => {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  return { command, args: [filePath] };
};

export interface OpenConfig {
  name: string;
  description: string;
  command: string | typeof createDefaultCommand;
  options: {
    detached: boolean;
    stdio: 'inherit' | 'ignore';
    shell?: boolean;
  };
  waitForExit: boolean;
}

export const openConfigs: Record<OpenType, OpenConfig> = {
  default: {
    name: 'Default Application',
    description: 'Opens with system default application (separate window)',
    command: createDefaultCommand,
    options: {
      detached: true,
      stdio: 'ignore',
    },
    waitForExit: false,
  },
  vim: {
    name: 'Vim',
    description: 'Opens in Vim editor (terminal-based)',
    command: 'vim',
    options: {
      detached: false,
      stdio: 'inherit',
      shell: true,
    },
    waitForExit: true,
  },
  nano: {
    name: 'Nano',
    description: 'Opens in Nano editor (terminal-based)',
    command: 'nano',
    options: {
      detached: false,
      stdio: 'inherit',
      shell: true,
    },
    waitForExit: true,
  },
  code: {
    name: 'VS Code',
    description: 'Opens in Visual Studio Code (separate window)',
    command: 'code',
    options: {
      detached: true,
      stdio: 'ignore',
    },
    waitForExit: false,
  },
  subl: {
    name: 'Sublime Text',
    description: 'Opens in Sublime Text (separate window)',
    command: 'subl',
    options: {
      detached: true,
      stdio: 'ignore',
    },
    waitForExit: false,
  },
};

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
  onSuccess?: Function,
  onError?: Function
): Promise<void> {
  return new Promise((resolve, reject) => {
    const config = getOpenConfig(openType);

    let command: string;
    let args: string[];

    if (typeof config.command === 'function') {
      const result = config.command(filePath);
      command = result.command;
      args = result.args;
    } else {
      command = config.command;
      args = [filePath];
    }

    const child: ChildProcess = spawn(command, args, config.options);

    if (config.options.detached) {
      child.unref();
    }

    child.on('error', (error) => {
      const errorMsg = `Failed to open with ${config.name}: ${error.message}`;
      if (onError) {
        onError(errorMsg);
      }
      reject(new Error(errorMsg));
    });

    if (config.waitForExit) {
      child.on('exit', (code) => {
        if (code === 0) {
          const successMsg = `File editing completed with ${config.name}.`;
          if (onSuccess) {
            onSuccess(successMsg);
          }
          resolve();
        } else {
          const errorMsg = `${config.name} exited with code ${code}`;
          if (onError) {
            onError(errorMsg);
          }
          reject(new Error(errorMsg));
        }
      });
    } else {
      // For non-waiting editors, immediately resolve
      const successMsg = `File opened with ${config.name}.`;
      if (onSuccess) {
        onSuccess(successMsg);
      }
      resolve();
    }
  });
}
