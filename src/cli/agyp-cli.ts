import { AgypService } from '../infrastructure/agyp/agyp-service';

export class AgypCli {
  private readonly service: AgypService;

  constructor(service?: AgypService) {
    this.service = service ?? new AgypService();
  }

  public async run(argv: string[]): Promise<number> {
    const command = argv[0]?.toLowerCase();

    if (!command || command === 'pick') {
      const result = await this.service.pickOrSwitch();
      return this.handleResult(result);
    }

    switch (command) {
      case 'list':
      case 'ls': {
        const result = this.service.listAccounts();
        return this.handleResult(result);
      }
      case 'current':
      case 'whoami': {
        const result = this.service.currentAccount();
        return this.handleResult(result);
      }
      case 'use':
      case 'switch': {
        const targetEmail = argv[1];
        if (!targetEmail) {
          console.error('Error: specify account email to use (e.g. `agyp use user@gmail.com`)');
          return 1;
        }
        const result = await this.service.pickOrSwitch(targetEmail);
        return this.handleResult(result);
      }
      case 'logout':
      case 'rm':
      case 'remove': {
        const targetEmail = argv[1];
        if (!targetEmail) {
          console.error('Error: specify account email to remove');
          return 1;
        }
        const result = this.service.removeAccount(targetEmail);
        return this.handleResult(result);
      }
      case 'login': {
        const targetEmail = argv[1];
        const result = await this.service.loginAccount(targetEmail);
        return this.handleResult(result);
      }
      case 'add':
      case 'import': {
        const email = argv[1];
        const token = argv[2];
        if (!email || !token) {
          console.error('Usage: agyp add <email> <token-content>');
          return 1;
        }
        const result = this.service.addAccount(email, token);
        return this.handleResult(result);
      }
      case 'help':
      case '--help':
      case '-h': {
        this.printHelp();
        return 0;
      }
      default: {
        const result = await this.service.pickOrSwitch(command);
        if (
          result.success ||
          result.message?.includes('Ambiguous') ||
          (result.message?.includes('not found') && command.includes('@'))
        ) {
          return this.handleResult(result);
        }
        console.error(`Unknown agyp command: "${command}"`);
        this.printHelp();
        return 1;
      }
    }
  }

  private handleResult(result: {
    success: boolean;
    message?: string;
    action?: string;
    payload?: string;
  }): number {
    if (!result.success) {
      if (result.message) {
        console.error(result.message);
      }
      return 1;
    }

    if (result.payload) {
      console.log(result.payload);
    }
    return 0;
  }

  private printHelp(): void {
    console.log(`
agyp - Antigravity Multi-Account Switcher & Environment Manager

Usage:
  agyp                         Interactive terminal UI to select or add accounts
  agyp <prefix|email>          Quickly switch active account via fuzzy match (e.g. \`agyp work\`)
  agyp login [email]           Launch browser login for a new account without overwriting existing
  agyp add <email> <token>     Directly register an existing token in the vault
  agyp use <prefix|email>      Switch active shell account to matching email
  agyp list                    List all registered accounts with active marker
  agyp current                 Print the currently active account
  agyp logout <prefix|email>   Remove an account and automatically re-sync shell environment
  agyp help                    Show this help message

Notes:
  - Account selection via \`agyp\` exports AGY_ACCOUNT and token paths into your shell session.
  - The \`agy\` command automatically routes to the active account across new tabs and tmux panes.
`);
  }
}
