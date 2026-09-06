import { describe, expect, test } from 'bun:test';
import { AGYP_COMMANDS, findCommand } from '../../../src/cli/agyp-commands';
import { renderCommandHelp, renderOverviewHelp } from '../../../src/cli/agyp-help';

/**
 * Every action the interactive menu offers has to be reachable without it,
 * because unattended callers never see the menu. The mapping is asserted
 * explicitly so removing a command cannot quietly break that promise.
 */
const MENU_ACTION_COMMANDS: Record<string, string> = {
  use: 'use',
  global: 'global',
  remove: 'logout',
  login: 'login',
  refresh: 'quota',
};

describe('menu and command-line parity', () => {
  test('every menu action has a command', () => {
    for (const [action, command] of Object.entries(MENU_ACTION_COMMANDS)) {
      expect(
        findCommand(command),
        `menu action "${action}" needs \`agyp ${command}\``
      ).toBeDefined();
    }
  });

  test('refreshing quota is reachable from both list and quota', () => {
    expect(findCommand('list')?.options.some((option) => option.flag === '--refresh')).toBeTrue();
    expect(findCommand('quota')?.options.some((option) => option.flag === '--cached')).toBeTrue();
  });
});

describe('help coverage', () => {
  test('every command has help naming its usage', () => {
    for (const command of AGYP_COMMANDS) {
      const help = renderCommandHelp(command);
      expect(help, command.name).toContain(`agyp ${command.name}`);
      expect(help.length, command.name).toBeGreaterThan(command.summary.length);
    }
  });

  test('every declared option appears in its command help', () => {
    for (const command of AGYP_COMMANDS) {
      const help = renderCommandHelp(command);
      for (const option of command.options) {
        expect(help, `${command.name} ${option.flag}`).toContain(option.flag);
        expect(help, `${command.name} ${option.flag}`).toContain(option.summary);
      }
    }
  });

  test('commands taking an argument document it', () => {
    for (const command of AGYP_COMMANDS) {
      if (command.argument === undefined) {
        continue;
      }
      expect(renderCommandHelp(command), command.name).toContain(command.argument.summary);
    }
  });

  test('destructive commands say so', () => {
    expect(renderCommandHelp(findCommand('logout')!)).toContain('changes stored state');
  });

  test('every command supports --json except the interactive and help ones', () => {
    for (const command of AGYP_COMMANDS) {
      if (command.name === 'menu' || command.name === 'help') {
        continue;
      }
      expect(
        command.options.some((option) => option.flag === '--json'),
        command.name
      ).toBeTrue();
    }
  });
});

describe('overview help', () => {
  test('lists every command', () => {
    const overview = renderOverviewHelp();
    for (const command of AGYP_COMMANDS) {
      expect(overview, command.name).toContain(command.name);
    }
  });

  test('documents exit codes and the environment contract', () => {
    const overview = renderOverviewHelp();
    expect(overview).toContain('Exit codes:');
    expect(overview).toContain('AGYP_HOME');
    expect(overview).toContain('AGYP_NO_TUI');
  });
});
