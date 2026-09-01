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
        const result = this.service.stageLogin(targetEmail);
        return this.handleResult(result);
      }
      case 'help':
      case '--help':
      case '-h': {
        this.printHelp();
        return 0;
      }
      default: {
        // If argument looks like an email, treat as `agyp use <email>`
        if (command.includes('@')) {
          const result = await this.service.pickOrSwitch(command);
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
  agyp                  Interactive terminal UI to select active account
  agyp use <email>      Switch active shell account to specified email
  agyp list             List all registered accounts
  agyp current          Print the currently active account
  agyp login [email]    Stage a new account login directory
  agyp logout <email>   Remove an account from the multi-account vault
  agyp help             Show this help message
`);
  }
}
