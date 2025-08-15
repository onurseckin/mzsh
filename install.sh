#!/bin/bash

# Install mzsh Script
# This script installs the mzsh package globally with silent success and detailed error reporting

set -e

# Import centralized messages
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/src/messages/shellMessages.sh"

install_info_starting
echo ""

# Verify we're in the correct directory
if [ ! -f "package.json" ]; then
    install_error_package_json_not_found
    exit 1
fi

if ! grep -q "mzsh" package.json; then
    install_error_not_mzsh_project
    exit 1
fi

# Check for required dependencies
if ! command -v bun >/dev/null 2>&1; then
    install_error_bun_not_installed
    exit 1
fi

# Check for TypeScript and install dependencies if needed (silent)
if ! command -v tsc >/dev/null 2>&1; then
    bun install >/dev/null 2>&1
fi

# Clean previous installations (silent)
if command -v mzsh >/dev/null 2>&1; then
    bun unlink >/dev/null 2>&1 || true
    npm uninstall -g zshrc-manager >/dev/null 2>&1 || true
    EXISTING_PATH=$(which mzsh 2>/dev/null || echo "")
    if [ -n "$EXISTING_PATH" ] && [ -L "$EXISTING_PATH" ]; then
        rm -f "$EXISTING_PATH" 2>/dev/null || true
    fi
fi

# Install dependencies (silent)
bun install >/dev/null 2>&1

# Build project (silent success, detailed error)
if ! bun run build >/dev/null 2>&1; then
    install_error_build_failed
    exit 1
fi

# Link globally (silent success, detailed error)
if ! bun link >/dev/null 2>&1; then
    install_error_global_install_failed
    exit 1
fi

# Configure PATH if needed (silent)
PATH_NEEDS_UPDATE=false
if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
    PATH_NEEDS_UPDATE=true
    
    # Determine which shell config file to use
    SHELL_CONFIG=""
    if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_CONFIG="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
        SHELL_CONFIG="$HOME/.bashrc"
    else
        SHELL_CONFIG="$HOME/.profile"
    fi
    
    # Add PATH export to shell config if not already present
    if [ -f "$SHELL_CONFIG" ] && grep -q 'export PATH.*\.bun/bin' "$SHELL_CONFIG" 2>/dev/null; then
        PATH_NEEDS_UPDATE=false
    else
        echo "" >> "$SHELL_CONFIG"
        echo "# Added by mzsh installer" >> "$SHELL_CONFIG"
        echo 'export PATH="$HOME/.bun/bin:$PATH"' >> "$SHELL_CONFIG"
    fi
fi

# Verify installation (silent success, detailed error)
sleep 1
EXPECTED_PATH="$HOME/.bun/bin/mzsh"
if [ ! -f "$EXPECTED_PATH" ] && [ ! -L "$EXPECTED_PATH" ]; then
    install_error_binary_not_found
    exit 1
fi

if ! command -v mzsh >/dev/null 2>&1 && [ "$PATH_NEEDS_UPDATE" = false ]; then
    install_error_command_not_accessible
    exit 1
fi

echo ""
install_success_completed
echo ""

# Source shell configuration for verification (silent)
set +e
if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
    source ~/.zshrc >/dev/null 2>&1
elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
    source ~/.bashrc >/dev/null 2>&1
else
    source ~/.profile >/dev/null 2>&1
fi
set -e

install_info_shell_refresh
echo ""

# Automatically refresh shell session
if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
    exec zsh
elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
    exec bash
else
    exec "$SHELL"
fi
