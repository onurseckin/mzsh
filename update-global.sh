#!/bin/bash

# Update Global zshrc-manager Script
# This script updates the globally installed zshrc-manager package

set -e

echo "🔄 Updating global zshrc-manager installation..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || ! grep -q "zshrc-manager" package.json; then
    echo "❌ Error: This script must be run from the zshrc-manager project directory"
    exit 1
fi

echo "📦 Building project..."
bun run build

echo "🗑️  Removing old global installation..."
# Try to unlink from bun
bun unlink 2>/dev/null || echo "No bun link found"

# Try to remove from npm global if it exists
npm uninstall -g zshrc-manager 2>/dev/null || echo "No npm global installation found"

# Clean any existing symlinks or installations
if command -v zshrc >/dev/null 2>&1; then
  echo "Found existing zshrc command, attempting to clean up..."
  # Get the path of the existing command
  EXISTING_PATH=$(which zshrc 2>/dev/null || echo "")
  if [ -n "$EXISTING_PATH" ] && [ -L "$EXISTING_PATH" ]; then
    echo "Removing symlink: $EXISTING_PATH"
    rm -f "$EXISTING_PATH" 2>/dev/null || echo "Could not remove existing symlink"
  fi
fi

echo "📥 Installing updated version globally..."
bun link

echo "✅ Global zshrc-manager updated successfully!"
echo ""

# Check if ~/.bun/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
  echo "⚠️  Adding ~/.bun/bin to PATH..."
  echo ""
  echo "Add this line to your shell configuration file (~/.zshrc, ~/.bashrc, etc.):"
  echo "export PATH=\"\$HOME/.bun/bin:\$PATH\""
  echo ""
  echo "Or run this command now:"
  echo "echo 'export PATH=\"\$HOME/.bun/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
  echo ""
else
  echo "✅ ~/.bun/bin is already in PATH"
fi

echo "You can now use 'zshrc' command from anywhere:"
echo "  zshrc                    # Use default application"
echo "  zshrc -o vim            # Open with vim"
echo "  zshrc -o nano           # Open with nano"
echo "  zshrc -o code           # Open with VS Code"
echo "  zshrc --open-type subl  # Open with Sublime Text"
echo ""
echo "Available opening types: default, vim, nano, code, subl"
