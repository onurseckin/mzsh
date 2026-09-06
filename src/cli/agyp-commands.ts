export interface AgypOptionSpec {
  flag: string;
  alias?: string;
  argument?: string;
  summary: string;
}

export interface AgypArgumentSpec {
  name: string;
  required: boolean;
  summary: string;
}

export interface AgypCommandSpec {
  name: string;
  aliases: readonly string[];
  summary: string;
  argument?: AgypArgumentSpec;
  options: readonly AgypOptionSpec[];
  examples: readonly string[];
  /** Marks commands that change stored state, so help can warn about them. */
  mutates?: boolean;
}

const JSON_OPTION: AgypOptionSpec = {
  flag: '--json',
  summary: 'Emit a machine-readable result instead of formatted text.',
};

const HELP_OPTION: AgypOptionSpec = {
  flag: '--help',
  alias: '-h',
  summary: 'Show help for this command.',
};

const ACCOUNT_ARGUMENT: AgypArgumentSpec = {
  name: 'account',
  required: true,
  summary: 'Email, or any unambiguous prefix or substring of one.',
};

export const AGYP_COMMANDS: readonly AgypCommandSpec[] = [
  {
    name: 'use',
    aliases: ['switch'],
    summary: 'Bind an account to this shell.',
    argument: ACCOUNT_ARGUMENT,
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp use work', 'agyp use person@example.com --json'],
  },
  {
    name: 'global',
    aliases: [],
    summary: 'Mirror an account into the login keychain for the IDE and bare agy.',
    argument: ACCOUNT_ARGUMENT,
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp global work'],
    mutates: true,
  },
  {
    name: 'sync',
    aliases: [],
    summary: "Re-push this shell's account, or the global one, into the login keychain.",
    argument: { name: 'account', required: false, summary: 'Defaults to this shell, then global.' },
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp sync', 'agyp sync work'],
    mutates: true,
  },
  {
    name: 'list',
    aliases: ['ls'],
    summary: 'List accounts with their quota.',
    options: [
      {
        flag: '--refresh',
        summary: 'Probe accounts with no running agy instead of using the cached reading.',
      },
      JSON_OPTION,
      HELP_OPTION,
    ],
    examples: ['agyp list', 'agyp list --json', 'agyp list --refresh'],
  },
  {
    name: 'quota',
    aliases: [],
    summary: 'Report remaining Gemini quota, probing accounts that are not running.',
    argument: { name: 'account', required: false, summary: 'Limit the report to one account.' },
    options: [
      { flag: '--cached', summary: 'Never start a probe; report the last known reading.' },
      JSON_OPTION,
      HELP_OPTION,
    ],
    examples: ['agyp quota', 'agyp quota --json', 'agyp quota work --cached'],
  },
  {
    name: 'best',
    aliases: [],
    summary: 'Print the account with the most quota left.',
    options: [
      {
        flag: '--min',
        argument: '<percent>',
        summary: 'Require at least this much remaining; exit 3 if nothing qualifies.',
      },
      { flag: '--cached', summary: 'Never start a probe; use the last known readings.' },
      JSON_OPTION,
      HELP_OPTION,
    ],
    examples: ['agyp best', 'agyp best --min 20 --json'],
  },
  {
    name: 'auto',
    aliases: [],
    summary: 'Switch this shell to the best account when the current one is running low.',
    options: [
      {
        flag: '--min',
        argument: '<percent>',
        summary: 'Switch when the current account falls below this. Default 15.',
      },
      { flag: '--cached', summary: 'Never start a probe; use the last known readings.' },
      JSON_OPTION,
      HELP_OPTION,
    ],
    examples: ['agyp auto', 'agyp auto --min 25 --json'],
  },
  {
    name: 'current',
    aliases: ['whoami'],
    summary: "Show this shell's account and the global default.",
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp current --json'],
  },
  {
    name: 'login',
    aliases: [],
    summary: 'Sign in to an additional account. Needs a terminal.',
    argument: {
      name: 'email',
      required: false,
      summary: 'Used only if the account cannot be read from the sign-in itself.',
    },
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp login', 'agyp login person@example.com'],
    mutates: true,
  },
  {
    name: 'claim',
    aliases: [],
    summary: 'Attach a kept sign-in whose account could not be identified.',
    argument: { name: 'email', required: true, summary: 'Account the kept sign-in belongs to.' },
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp claim person@example.com'],
    mutates: true,
  },
  {
    name: 'import',
    aliases: [],
    summary: 'Adopt whatever account the login keychain currently holds.',
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp import'],
    mutates: true,
  },
  {
    name: 'logout',
    aliases: ['rm', 'remove'],
    summary: 'Forget an account and delete its sandbox. The stored sign-in is lost.',
    argument: ACCOUNT_ARGUMENT,
    options: [JSON_OPTION, HELP_OPTION],
    examples: ['agyp logout old@example.com'],
    mutates: true,
  },
  {
    name: 'doctor',
    aliases: [],
    summary: 'Report vault health, stored sign-ins, their backup copies and running agy instances.',
    options: [
      {
        flag: '--repair',
        summary:
          'Restore any missing or unopenable sign-in from its backup copies and complete the copies.',
      },
      JSON_OPTION,
      HELP_OPTION,
    ],
    examples: ['agyp doctor', 'agyp doctor --repair', 'agyp doctor --json'],
  },
  {
    name: 'menu',
    aliases: ['pick'],
    summary: 'Open the interactive account menu. This is what a bare `agyp` runs.',
    options: [HELP_OPTION],
    examples: ['agyp', 'agyp menu'],
  },
  {
    name: 'help',
    aliases: [],
    summary: 'Show help for agyp or for one command.',
    argument: { name: 'command', required: false, summary: 'Command to describe.' },
    options: [],
    examples: ['agyp help', 'agyp help auto'],
  },
];

export function findCommand(name: string): AgypCommandSpec | undefined {
  const lowered = name.toLowerCase();
  return AGYP_COMMANDS.find(
    (command) => command.name === lowered || command.aliases.includes(lowered)
  );
}

export function commandNames(): string[] {
  return AGYP_COMMANDS.flatMap((command) => [command.name, ...command.aliases]);
}
