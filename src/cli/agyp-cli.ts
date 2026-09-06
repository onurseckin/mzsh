import { AgypService } from '../infrastructure/agyp/agyp-service';
import { parseArguments, readNumericFlag } from './agyp-arguments';
import { findCommand, type AgypCommandSpec } from './agyp-commands';
import { AgypHandlers } from './agyp-handlers';
import { renderCommandHelp, renderOverviewHelp } from './agyp-help';
import { renderJson, type CommandOutcome } from './agyp-output';
import { DEFAULT_SWITCH_THRESHOLD } from '../domain/agyp/agyp-selection';

const USAGE_EXIT_CODE = 2;

export class AgypCli {
  private readonly service: AgypService;
  private readonly handlers: AgypHandlers;

  constructor(service?: AgypService) {
    this.service = service ?? new AgypService();
    this.handlers = new AgypHandlers(this.service);
  }

  /**
   * A bare `agyp` opens the menu; `agyp <account>` is shorthand for `use`.
   * Anything else that is not a known command is a usage error rather than a
   * silent fallback, so a mistyped command never quietly switches accounts.
   */
  private resolveDefault(token: string | undefined): AgypCommandSpec | undefined {
    if (token === undefined || token.startsWith('-')) {
      return findCommand('menu');
    }
    return findCommand('use');
  }

  public async run(argv: readonly string[]): Promise<number> {
    if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
      return this.help(argv[1]);
    }

    const parsed = parseArguments(argv, (token) => this.resolveDefault(token));
    if (!parsed.ok) {
      console.error(parsed.failure.usageError);
      console.error('');
      console.error(
        parsed.failure.command === undefined
          ? 'Run `agyp help` to list commands.'
          : `Run \`agyp help ${parsed.failure.command.name}\` for usage.`
      );
      return USAGE_EXIT_CODE;
    }

    const { command, argument, flags, wantsHelp } = parsed.parsed;
    if (wantsHelp) {
      console.log(renderCommandHelp(command));
      return 0;
    }

    const wantsJson = flags.get('--json') === true;
    const cached = flags.get('--cached') === true;
    const minimum = readNumericFlag(flags, '--min');
    if (minimum.error !== undefined) {
      console.error(minimum.error);
      return USAGE_EXIT_CODE;
    }

    const outcome = await this.dispatch(command, argument, {
      refresh: flags.get('--refresh') === true,
      cached,
      minimum: minimum.value,
    });
    return this.emit(command.name, outcome, wantsJson);
  }

  private async dispatch(
    command: AgypCommandSpec,
    argument: string | undefined,
    options: { refresh: boolean; cached: boolean; minimum?: number }
  ): Promise<CommandOutcome> {
    switch (command.name) {
      case 'use':
        return this.handlers.use(argument ?? '');
      case 'global':
        return this.handlers.setGlobal(argument ?? '');
      case 'sync':
        return this.handlers.sync(argument);
      case 'list':
        return this.handlers.list(options.refresh);
      case 'quota':
        return this.handlers.quota(argument, options.cached);
      case 'best':
        return this.handlers.best(options.minimum, options.cached);
      case 'auto':
        return this.handlers.auto(options.minimum ?? DEFAULT_SWITCH_THRESHOLD, options.cached);
      case 'current':
        return this.handlers.current();
      case 'login':
        return this.handlers.login();
      case 'import':
        return this.handlers.importCurrent();
      case 'logout':
        return this.handlers.logout(argument ?? '');
      case 'doctor':
        return this.handlers.doctor();
      case 'menu':
        return this.menu();
      default:
        return {
          exitCode: USAGE_EXIT_CODE,
          error: `Command "${command.name}" is not implemented.`,
        };
    }
  }

  /**
   * Refuses the menu when the caller has declared itself non-interactive.
   * An unattended caller that lands here would otherwise block on a terminal
   * that will never answer.
   */
  private async menu(): Promise<CommandOutcome> {
    if (process.env.AGYP_NO_TUI !== undefined && process.env.AGYP_NO_TUI !== '') {
      return {
        exitCode: USAGE_EXIT_CODE,
        error:
          'AGYP_NO_TUI is set, so the interactive menu is disabled. Use `agyp list`, `agyp use <account>` or `agyp auto` instead.',
      };
    }
    return this.handlers.menu();
  }

  private help(topic: string | undefined): number {
    if (topic === undefined) {
      console.log(renderOverviewHelp());
      return 0;
    }
    const command = findCommand(topic);
    if (command === undefined) {
      console.error(`No such command "${topic}".`);
      console.error('');
      console.error('Run `agyp help` to list commands.');
      return USAGE_EXIT_CODE;
    }
    console.log(renderCommandHelp(command));
    return 0;
  }

  private emit(command: string, outcome: CommandOutcome, wantsJson: boolean): number {
    if (wantsJson) {
      // Notes and errors travel inside the envelope in JSON mode; nothing goes
      // to stderr, so a caller can parse stdout alone.
      console.log(renderJson(command, outcome));
      return outcome.exitCode;
    }

    const aside = outcome.error ?? outcome.note;
    if (aside !== undefined) {
      console.error(aside);
    }
    const body = outcome.shell ?? outcome.text;
    if (body !== undefined && body.length > 0) {
      console.log(body);
    }
    return outcome.exitCode;
  }
}
