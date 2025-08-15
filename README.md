# mzsh

Interactive zsh configuration file manager with multiple opening options.

## Features

- 🔍 **Auto-discovery**: Automatically finds `.zshrc` and files in `~/.config/zsh/`
- 🎨 **Interactive menu**: Beautiful file selection with visual indicators
- 🛠️ **Multiple editors**: Support for various editors and applications
- 🌍 **Global command**: Install once, use anywhere
- ⚡ **Fast**: Built with Bun for optimal performance
- 🔄 **Self-updating**: Built-in update and reinstall functionality

## Installation

### Global Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/mzsh.git
cd mzsh

# Install dependencies
bun install

# Install globally
bun run inst
```

Now you can use `mzsh` command from anywhere!

## Usage

### Basic Usage

```bash
mzsh                    # Opens with default system application
```

### With Editor Options

```bash
mzsh -o vim            # Open with Vim
mzsh -o nano           # Open with Nano
mzsh -o code           # Open with VS Code
mzsh --open-type subl  # Open with Sublime Text
```

### Update and Maintenance

```bash
mzsh --update          # Update to latest version
mzsh --reinstall       # Reinstall (same as --update)
```

### Package Manager Scripts

```bash
bun run inst           # Install globally
bun run uninst         # Uninstall globally
bun run update         # Update installation
```

### Available Opening Types

| Type      | Description                | Behavior                               |
| --------- | -------------------------- | -------------------------------------- |
| `default` | System default application | Opens in separate window, non-blocking |
| `vim`     | Vim editor                 | Terminal-based, waits for completion   |
| `nano`    | Nano editor                | Terminal-based, waits for completion   |
| `code`    | Visual Studio Code         | Separate window, non-blocking          |
| `subl`    | Sublime Text               | Separate window, non-blocking          |

## Development

### Project Structure

```
mzsh/
├── src/
│   ├── index.ts            # Main command logic
│   ├── fileDiscovery.ts    # File discovery system
│   ├── interactiveMenu.ts  # Interactive menu interface
│   ├── updateManager.ts    # Update/reinstall functionality
│   └── openConfig.ts       # Opening configurations
├── bin/
│   ├── run-standalone.ts   # Standalone runner
│   ├── run-built.ts        # Production runner
│   └── run-oclif.ts        # OCLIF runner
├── install.sh              # Installation script
├── uninstall.sh            # Uninstallation script
└── package.json
```

### Building

```bash
# Development build
bun run build:dev

# Production build
bun run build

# TypeScript only
bun run build:ts
```

### Scripts

- `bun run inst` - Install globally
- `bun run uninst` - Uninstall globally
- `bun run update` - Update installation
- `bun run build` - Build for production
- `bun run build:dev` - Build for development
- `bun run lint` - Run linter
- `bun run format` - Format code

## Requirements

- [Bun](https://bun.sh) - JavaScript runtime and package manager
- Node.js compatible environment
- Unix-like system (macOS, Linux) or Windows with WSL

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Troubleshooting

### Command not found after installation

If `mzsh` command is not found after installation, make sure `~/.bun/bin` is in your PATH:

```bash
# For zsh users
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# For bash users
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Update issues

If you encounter issues during updates, try:

1. Navigate to the original project directory
2. Run `mzsh --update` from there
3. Or use `bun run update` directly

For more help, see the comprehensive error messages provided by the update system.