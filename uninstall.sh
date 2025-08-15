#!/bin/bash

# Uninstall zshrc-manager Script
# This script removes the zshrc-manager package from global installation with comprehensive checks and logging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${BLUE}🔄 $1${NC}"
}

echo "🗑️  Uninstalling zshrc-manager..."
echo ""

# Step 1: Check if mzsh command exists
log_step "Step 1: Checking for existing installation..."

if ! command -v mzsh >/dev/null 2>&1; then
    log_warning "mzsh command not found - may already be uninstalled"
    echo ""
    log_info "Checking for any remaining installations..."
else
    EXISTING_PATH=$(which mzsh 2>/dev/null || echo "")
    log_info "Found mzsh command at: $EXISTING_PATH"
fi

# Step 2: Remove bun link
log_step "Step 2: Removing bun link..."
if bun unlink 2>/dev/null; then
    log_success "Bun link removed successfully"
else
    log_info "No bun link found (this is normal if not installed via bun link)"
fi

# Step 3: Remove npm global installation
log_step "Step 3: Checking for npm global installation..."
if npm list -g zshrc-manager >/dev/null 2>&1; then
    log_info "Found npm global installation, removing..."
    if npm uninstall -g zshrc-manager 2>/dev/null; then
        log_success "npm global installation removed"
    else
        log_error "Failed to remove npm global installation"
        log_info "You may need to run: sudo npm uninstall -g zshrc-manager"
    fi
else
    log_info "No npm global installation found"
fi

# Step 4: Remove any remaining symlinks
log_step "Step 4: Cleaning up symlinks and binaries..."

# Common locations where the binary might be installed
POSSIBLE_LOCATIONS=(
    "$HOME/.bun/bin/mzsh"
    "/usr/local/bin/mzsh"
    "/usr/bin/mzsh"
    "$HOME/.local/bin/mzsh"
)

REMOVED_COUNT=0

for location in "${POSSIBLE_LOCATIONS[@]}"; do
    if [ -f "$location" ] || [ -L "$location" ]; then
        log_info "Found installation at: $location"
        if rm -f "$location" 2>/dev/null; then
            log_success "Removed: $location"
            ((REMOVED_COUNT++))
        else
            log_warning "Could not remove: $location (may require sudo)"
            log_info "You may need to run: sudo rm -f $location"
        fi
    fi
done

if [ $REMOVED_COUNT -eq 0 ]; then
    log_info "No additional binaries found to remove"
else
    log_success "Removed $REMOVED_COUNT binary file(s)"
fi

# Step 5: Check for any remaining zshrc-manager directories
log_step "Step 5: Checking for remaining directories..."

# Common directories where packages might be installed
POSSIBLE_DIRS=(
    "$HOME/.bun/install/global/node_modules/zshrc-manager"
    "$HOME/.npm-global/lib/node_modules/zshrc-manager"
    "/usr/local/lib/node_modules/zshrc-manager"
)

DIRS_REMOVED=0

for dir in "${POSSIBLE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        log_info "Found directory: $dir"
        if rm -rf "$dir" 2>/dev/null; then
            log_success "Removed directory: $dir"
            ((DIRS_REMOVED++))
        else
            log_warning "Could not remove directory: $dir (may require sudo)"
            log_info "You may need to run: sudo rm -rf '$dir'"
        fi
    fi
done

if [ $DIRS_REMOVED -eq 0 ]; then
    log_info "No package directories found to remove"
else
    log_success "Removed $DIRS_REMOVED package directory(ies)"
fi

# Step 6: Verify uninstallation
log_step "Step 6: Verifying uninstallation..."
sleep 1  # Give a moment for changes to take effect

if command -v mzsh >/dev/null 2>&1; then
    REMAINING_PATH=$(which mzsh 2>/dev/null || echo "")
    log_warning "mzsh command still found at: $REMAINING_PATH"
    log_info "This may be a different installation or require manual removal"
    echo ""
    log_info "To manually remove, you can try:"
    echo "  sudo rm -f '$REMAINING_PATH'"
    echo ""
    exit 1
else
    log_success "mzsh command successfully removed from system"
fi

# Step 7: Clean up any remaining configuration
log_step "Step 7: Checking for configuration cleanup..."

# Check if there are any zshrc-manager related entries in shell configs
SHELL_CONFIGS=(
    "$HOME/.zshrc"
    "$HOME/.bashrc"
    "$HOME/.profile"
    "$HOME/.bash_profile"
)

CONFIG_WARNINGS=0

for config in "${SHELL_CONFIGS[@]}"; do
    if [ -f "$config" ] && grep -q "zshrc-manager\|\.bun/bin.*zshrc" "$config" 2>/dev/null; then
        log_warning "Found zshrc-manager references in: $config"
        log_info "You may want to manually review and clean up this file"
        ((CONFIG_WARNINGS++))
    fi
done

if [ $CONFIG_WARNINGS -eq 0 ]; then
    log_info "No shell configuration cleanup needed"
else
    echo ""
    log_info "Consider reviewing your shell configuration files for any manual cleanup"
fi

echo ""
log_success "🎉 zshrc-manager uninstallation completed!"
echo ""

# Final status summary
log_info "Uninstallation Summary:"
echo "  • Bun link: Removed"
echo "  • npm global: Checked and removed if found"
echo "  • Binary files: $REMOVED_COUNT removed"
echo "  • Package directories: $DIRS_REMOVED removed"
echo "  • Command verification: Passed"

if [ $CONFIG_WARNINGS -gt 0 ]; then
    echo ""
    log_info "Note: $CONFIG_WARNINGS shell configuration file(s) may need manual review"
fi

echo ""
log_success "zshrc-manager has been successfully uninstalled from your system!"
echo ""
