#!/bin/bash

# Uninstall mzsh Script
# This script removes the mzsh package from global installation with silent success and detailed error reporting

set -e

# Import centralized messages
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/src/messages/shellMessages.sh"

uninstall_info_starting
echo ""

# Remove bun link and npm global installation (silent success, detailed error)
bun unlink >/dev/null 2>&1 || true
if ! npm uninstall -g mzsh >/dev/null 2>&1; then
    # Only show error if npm is available and the command actually failed meaningfully
    if command -v npm >/dev/null 2>&1 && npm list -g mzsh >/dev/null 2>&1; then
        uninstall_error_npm_removal_failed
        exit 1
    fi
fi

# Remove binaries from common locations (silent success, detailed error)
POSSIBLE_LOCATIONS=(
    "$HOME/.bun/bin/mzsh"
    "/usr/local/bin/mzsh"
    "/usr/bin/mzsh"
    "$HOME/.local/bin/mzsh"
)

REMOVED_COUNT=0
BINARY_REMOVAL_FAILED=false
for location in "${POSSIBLE_LOCATIONS[@]}"; do
    if [ -f "$location" ] || [ -L "$location" ]; then
        if rm -f "$location" 2>/dev/null; then
            ((REMOVED_COUNT++))
        else
            BINARY_REMOVAL_FAILED=true
        fi
    fi
done

if [ "$BINARY_REMOVAL_FAILED" = true ]; then
    uninstall_error_binary_removal_failed
    exit 1
fi

# Remove package directories (silent success, detailed error)
POSSIBLE_DIRS=(
    "$HOME/.bun/install/global/node_modules/mzsh"
    "$HOME/.npm-global/lib/node_modules/mzsh"
    "/usr/local/lib/node_modules/mzsh"
)

DIRS_REMOVED=0
DIRECTORY_REMOVAL_FAILED=false
for dir in "${POSSIBLE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        if rm -rf "$dir" 2>/dev/null; then
            ((DIRS_REMOVED++))
        else
            DIRECTORY_REMOVAL_FAILED=true
        fi
    fi
done

if [ "$DIRECTORY_REMOVAL_FAILED" = true ]; then
    uninstall_error_directory_removal_failed
    exit 1
fi

# Verify uninstallation (silent success, detailed error)
sleep 1
if command -v mzsh >/dev/null 2>&1; then
    REMAINING_PATH=$(which mzsh 2>/dev/null || echo "")
    uninstall_error_still_found "$REMAINING_PATH"
    exit 1
fi

# Clean up mzsh installer comments from shell configs
SHELL_CONFIGS=(
    "$HOME/.zshrc"
    "$HOME/.bashrc"
    "$HOME/.profile"
    "$HOME/.bash_profile"
)

CONFIG_CLEANED=0
for config in "${SHELL_CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        if grep -q "# Added by mzsh installer" "$config" 2>/dev/null; then
            cp "$config" "${config}.mzsh-backup" 2>/dev/null || true
            sed -i.tmp '/# Added by mzsh installer/d' "$config"
            rm -f "${config}.tmp"
            ((CONFIG_CLEANED++))
        fi
    fi
done

echo ""
uninstall_success_completed
echo ""

uninstall_info_shell_refresh
echo ""

# Automatically refresh shell session
if [ -n "$ZSH_VERSION" ] || [[ "$SHELL" == *"zsh"* ]]; then
    exec zsh
elif [ -n "$BASH_VERSION" ] || [[ "$SHELL" == *"bash"* ]]; then
    exec bash
else
    exec "$SHELL"
fi
