#!/bin/bash

# Install mzsh Script
# This script installs the mzsh package globally with comprehensive checks and logging

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

echo "🚀 Installing mzsh globally..."
echo ""

# Step 1: Verify we're in the correct directory
log_step "Step 1: Verifying project directory..."
if [ ! -f "package.json" ]; then
    log_error "package.json not found. This script must be run from the mzsh project directory"
    exit 1
fi

if ! grep -q "mzsh" package.json; then
    log_error "This doesn't appear to be the mzsh project directory"
    exit 1
fi

log_success "Project directory verified"

# Step 2: Check for required dependencies
log_step "Step 2: Checking dependencies..."

# Check for bun
if ! command -v bun >/dev/null 2>&1; then
    log_error "Bun is not installed. Please install Bun first: https://bun.sh"
    exit 1
fi
log_success "Bun found: $(bun --version)"

# Check for TypeScript
if ! command -v tsc >/dev/null 2>&1; then
    log_warning "TypeScript compiler not found globally. Installing project dependencies..."
    bun install
fi

# Step 3: Clean previous installations
log_step "Step 3: Cleaning previous installations..."

# Check if mzsh command already exists
if command -v mzsh >/dev/null 2>&1; then
    log_warning "Found existing mzsh command"
    EXISTING_PATH=$(which mzsh 2>/dev/null || echo "")
    if [ -n "$EXISTING_PATH" ]; then
        log_info "Existing installation: $EXISTING_PATH"
        
        # Try to unlink from bun
        if bun unlink 2>/dev/null; then
            log_success "Removed existing bun link"
        else
            log_info "No bun link found to remove"
        fi
        
        # Try to remove from npm global if it exists
        if npm uninstall -g zshrc-manager 2>/dev/null; then
            log_success "Removed existing npm global installation"
        else
            log_info "No npm global installation found"
        fi
        
        # Clean symlinks
        if [ -L "$EXISTING_PATH" ]; then
            log_info "Removing symlink: $EXISTING_PATH"
            if rm -f "$EXISTING_PATH" 2>/dev/null; then
                log_success "Symlink removed"
            else
                log_warning "Could not remove existing symlink (may require sudo)"
            fi
        fi
    fi
else
    log_info "No existing mzsh command found"
fi

# Step 4: Install project dependencies
log_step "Step 4: Installing project dependencies..."
if bun install; then
    log_success "Dependencies installed"
else
    log_error "Failed to install dependencies"
    exit 1
fi

# Step 5: Build the project
log_step "Step 5: Building project..."
if bun run build; then
    log_success "Project built successfully"
else
    log_error "Build failed"
    exit 1
fi

# Step 6: Link globally
log_step "Step 6: Installing globally..."
if bun link; then
    log_success "Global installation completed"
else
    log_error "Global installation failed"
    exit 1
fi

# Step 7: Check PATH configuration first
log_step "Step 7: Checking PATH configuration..."
PATH_NEEDS_UPDATE=false

if [[ ":$PATH:" != *":$HOME/.bun/bin:"* ]]; then
    PATH_NEEDS_UPDATE=true
    log_warning "~/.bun/bin is not in your PATH"
    echo ""
    log_info "To use the mzsh command, add ~/.bun/bin to your PATH:"
    echo ""
    echo "  For zsh users:"
    echo "    echo 'export PATH=\"\$HOME/.bun/bin:\$PATH\"' >> ~/.zshrc"
    echo "    source ~/.zshrc"
    echo ""
    echo "  For bash users:"
    echo "    echo 'export PATH=\"\$HOME/.bun/bin:\$PATH\"' >> ~/.bashrc"
    echo "    source ~/.bashrc"
    echo ""
    echo "  Or run this universal command:"
    echo "    echo 'export PATH=\"\$HOME/.bun/bin:\$PATH\"' >> ~/.profile"
    echo "    source ~/.profile"
    echo ""
else
    log_success "~/.bun/bin is already in PATH"
fi

# Step 8: Verify installation
log_step "Step 8: Verifying installation..."
sleep 1  # Give a moment for the link to be established

# Check if the binary exists in the expected location
EXPECTED_PATH="$HOME/.bun/bin/mzsh"
if [ -f "$EXPECTED_PATH" ] || [ -L "$EXPECTED_PATH" ]; then
    log_success "mzsh binary installed at: $EXPECTED_PATH"
    
    if command -v mzsh >/dev/null 2>&1; then
        # Command is in PATH and accessible
        if mzsh --help >/dev/null 2>&1; then
            log_success "Installation verified - command is working"
        else
            log_warning "Command installed but may not be working properly"
        fi
    else
        # Command exists but not in PATH
        if [ "$PATH_NEEDS_UPDATE" = true ]; then
            log_info "Command installed successfully but not in PATH"
            log_info "After updating your PATH, you can verify with: mzsh --help"
        else
            log_warning "Command installed but not accessible (PATH issue)"
        fi
    fi
else
    log_error "Installation verification failed - mzsh binary not found at expected location"
    log_info "Expected location: $EXPECTED_PATH"
    exit 1
fi

echo ""
log_success "🎉 mzsh installation completed successfully!"
echo ""
log_info "Usage examples:"
echo "  mzsh                     # Use default application"
echo "  mzsh -o vim             # Open with vim"
echo "  mzsh -o nano            # Open with nano"
echo "  mzsh -o code            # Open with VS Code"
echo "  mzsh --open-type subl   # Open with Sublime Text"
echo "  mzsh --update           # Update mzsh"
echo "  mzsh --reinstall        # Reinstall mzsh"
echo ""
log_info "Package manager scripts:"
echo "  bun run inst            # Install globally"
echo "  bun run uninst          # Uninstall globally"
echo "  bun run update          # Update installation"
echo ""
log_info "Available opening types: default, vim, nano, code, subl"
echo ""

# Step 9: Refresh shell if PATH was updated
if [ "$PATH_NEEDS_UPDATE" = true ]; then
    log_step "Step 9: Refreshing shell to apply PATH changes..."
    log_info "Starting new shell session with updated PATH..."
    echo ""
    exec zsh
else
    log_info "Installation complete! You can now use the 'mzsh' command."
fi
