import { AGYP_COMMANDS, type AgypCommandSpec } from './agyp-commands';

const INDENT = '  ';

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function renderOptionLines(command: AgypCommandSpec): string[] {
  if (command.options.length === 0) {
    return [];
  }
  const labels = command.options.map((option) => {
    const alias = option.alias === undefined ? '' : `, ${option.alias}`;
    const argument = option.argument === undefined ? '' : ` ${option.argument}`;
    return `${option.flag}${alias}${argument}`;
  });
  const width = Math.max(...labels.map((label) => label.length));
  return [
    '',
    'Options:',
    ...command.options.map(
      (option, index) => `${INDENT}${padRight(labels[index] ?? '', width)}  ${option.summary}`
    ),
  ];
}

function usageLine(command: AgypCommandSpec): string {
  const argument =
    command.argument === undefined
      ? ''
      : command.argument.required
        ? ` <${command.argument.name}>`
        : ` [${command.argument.name}]`;
  const options = command.options.length > 0 ? ' [options]' : '';
  return `agyp ${command.name}${argument}${options}`;
}

export function renderCommandHelp(command: AgypCommandSpec): string {
  const lines = [command.summary, '', 'Usage:', `${INDENT}${usageLine(command)}`];

  if (command.aliases.length > 0) {
    lines.push('', `Aliases: ${command.aliases.join(', ')}`);
  }
  if (command.argument !== undefined) {
    lines.push(
      '',
      'Argument:',
      `${INDENT}${padRight(command.argument.name, 10)}  ${command.argument.summary}`
    );
  }
  lines.push(...renderOptionLines(command));
  if (command.mutates === true) {
    lines.push('', 'This command changes stored state.');
  }
  if (command.examples.length > 0) {
    lines.push('', 'Examples:', ...command.examples.map((example) => `${INDENT}${example}`));
  }
  return lines.join('\n');
}

export function renderOverviewHelp(): string {
  const width = Math.max(...AGYP_COMMANDS.map((command) => command.name.length));
  return [
    'agyp - Antigravity account manager',
    '',
    'Usage:',
    `${INDENT}agyp                    Open the interactive account menu`,
    `${INDENT}agyp <account>          Shorthand for \`agyp use <account>\``,
    `${INDENT}agyp <command> [options]`,
    '',
    'Commands:',
    ...AGYP_COMMANDS.map(
      (command) => `${INDENT}${padRight(command.name, width)}  ${command.summary}`
    ),
    '',
    'Scopes:',
    `${INDENT}this shell  AGYP_ACCOUNT and AGYP_HOME; the agy wrapper points HOME at the sandbox.`,
    `${INDENT}global      The login keychain, used by the Antigravity IDE and any bare agy.`,
    '',
    'Every command accepts --json for machine-readable output and --help for detail.',
    '',
    'Exit codes:',
    `${INDENT}0  success`,
    `${INDENT}1  the operation failed`,
    `${INDENT}2  bad usage, such as an unknown command or flag`,
    `${INDENT}3  no account satisfied the request (\`best\` and \`auto\` with --min)`,
    '',
    'Environment:',
    `${INDENT}AGYP_ACCOUNT         Account bound to this shell.`,
    `${INDENT}AGYP_HOME            Sandbox home the agy wrapper uses as HOME.`,
    `${INDENT}AGYP_KEYCHAIN_MODE   'strict' stops sandboxes falling back to the login keychain.`,
    `${INDENT}AGYP_NO_TUI          Set to any value to refuse the menu, for non-interactive callers.`,
    '',
    'Run `agyp help <command>` for one command in detail.',
  ].join('\n');
}
