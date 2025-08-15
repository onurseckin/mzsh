# # zshrc-manager

Interactive zsh configuration file manager with multiple opening options.

## Features

- 🔍 **Auto-discovery**: Automatically finds `.zshrc` and files in `~/.config/zsh/`
- 🎨 **Interactive menu**: Beautiful file selection with visual indicators
- 🛠️ **Multiple editors**: Support for various editors and applications
- 🌍 **Global command**: Install once, use anywhere
- ⚡ **Fast**: Built with Bun for optimal performance

## Installation

### Global Installation (Recommended)

```bash
# Clone the repository
git clone <your-repo-url> zshrc-manager
cd zshrc-manager

# Install dependencies
bun install

# Build and install globally
bun run build
bun link

# Add Bun's bin directory to PATH if needed
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Now you can use `zshrc` command from anywhere!

## Usage

### Basic Usage

```bash
zshrc                    # Opens with default system application
```

### With Editor Options

```bash
zshrc -o vim            # Open with Vim
zshrc -o nano           # Open with Nano
zshrc -o code           # Open with VS Code
zshrc --open-type subl  # Open with Sublime Text
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
zshrc-manager/
├── src/
│   ├── commands/index.ts    # Main command logic
│   └── openConfig.ts        # Opening configurations
├── bin/
│   ├── run.ts              # Development runner (TypeScript)
│   ├── run-built.ts        # Production runner (TypeScript)
│   ├── run-oclif.ts        # oclif runner (TypeScript)
│   └── run-standalone.ts   # Standalone runner for global installation (TypeScript)
├── lib/                    # Compiled TypeScript output
├── dist/                   # Bundled output
├── eslint.config.ts        # ESLint configuration (TypeScript)
└── package.json
```

### Scripts

```bash
# Development
bun run start              # Run in development mode

bun run build             # Build for production (TypeScript + Bundle)
bun run build:dev         # Build without minification
bun run build:ts          # Compile TypeScript only

# Global Installation Management
bun run update            # Update global installation
./update-global.sh        # Alternative update script

# Code Quality
bun run lint              # Check linting
bun run lint:fix          # Fix linting issues
bun run format            # Format code
bun run format:check      # Check formatting
```

### Updating Global Installation

When you make changes to the project:

**Option 1: Using npm script**

```bash
bun run update
```

**Option 2: Using shell script**

```bash
./update-global.sh
```

**Option 3: Manual**

```bash
bun run build
bun unlink
bun link
```

## Configuration

### Adding New Opening Types

Edit `src/openConfig.ts` to add new opening methods:

```typescript
export const openConfigs: Record<OpenType, OpenConfig> = {
  // ... existing configs
  emacs: {
    name: 'Emacs',
    description: 'Opens in Emacs editor',
    command: 'emacs',
    options: {
      detached: false,
      stdio: 'inherit',
      shell: true,
    },
    waitForExit: true,
  },
};
```

Don't forget to update the `OpenType` union type and rebuild!

## Architecture

### Pure TypeScript Implementation

This project is built entirely in TypeScript, leveraging Bun's native TypeScript support:

- **🔧 All Source Files**: Every file (`.ts`) is properly typed TypeScript
- **🚀 Direct Execution**: Bun runs TypeScript files directly without compilation step
- **📦 Global Installation**: Uses TypeScript files directly via `#!/usr/bin/env bun`
- **🎯 Zero JavaScript**: No JavaScript wrappers or fallbacks needed

### Execution Modes

- **Development**: `bun run start` - Direct TypeScript execution
- **Production**: Compiled TypeScript (`lib/`) + bundled output (`dist/`) for optimal performance
- **Global Command**: Direct TypeScript execution via Bun's native support
- **Standalone**: Works independently of project location when installed globally

### Key Components

1. **Command Class** (`src/commands/index.ts`): Main CLI logic with dual-mode support (oclif + standalone)
2. **Opening Configuration** (`src/openConfig.ts`): Centralized editor/application configurations
3. **TypeScript Runners** (`bin/*.ts`): All entry points are pure TypeScript
4. **ESLint Configuration** (`eslint.config.ts`): TypeScript-aware linting

### TypeScript Benefits

- **🛡️ Type Safety**: Full type checking across all files
- **🔍 Better IDE Support**: IntelliSense, refactoring, and error detection
- **📝 Self-Documenting**: Types serve as inline documentation
- **🚀 Modern Syntax**: Latest TypeScript features and syntax
- **⚡ Bun Integration**: Native TypeScript support without build steps

## Troubleshooting

### Command not found after installation

```bash
# Check if Bun global bin is in PATH
echo $PATH | grep -E "(bun|\.bun)"

# Reinstall if needed
bun unlink
bun link
```

### Permission issues

```bash
# Make sure scripts are executable
chmod +x bin/*.js
chmod +x update-global.sh
```

### Editor not opening

- Ensure the editor is installed and available in PATH
- Try with `default` type first to test basic functionality
- Check error messages for specific issues

## License

MIT
