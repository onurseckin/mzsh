#!/bin/bash

# Shell Script Messages
# Centralized messages for shell scripts (install.sh, uninstall.sh)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Message formatting functions
format_error() {
    local message="$1"
    local action="$2"
    local code="$3"
    
    echo -e "${RED}❌ ${message}${NC}"
    if [ -n "$code" ]; then
        echo -e "${RED}   Code: ${code}${NC}"
    fi
    echo ""
    echo -e "${BLUE}💡 ${action}${NC}"
}

format_success() {
    local message="$1"
    echo -e "${GREEN}✅ ${message}${NC}"
}

format_info() {
    local message="$1"
    echo -e "${BLUE}ℹ️  ${message}${NC}"
}

format_warning() {
    local message="$1"
    echo -e "${YELLOW}⚠️  ${message}${NC}"
}

# Installation error messages
install_error_package_json_not_found() {
    format_error \
        "package.json not found" \
        "This script must be run from the mzsh project directory. Navigate to the project root and try again." \
        "INSTALL_001"
}

install_error_not_mzsh_project() {
    format_error \
        "This doesn't appear to be the mzsh project directory" \
        "Ensure you're in the correct mzsh project directory and package.json contains 'mzsh'." \
        "INSTALL_002"
}

install_error_bun_not_installed() {
    format_error \
        "Bun is not installed" \
        "Install Bun first by visiting https://bun.sh and following the installation instructions." \
        "INSTALL_003"
}

install_error_build_failed() {
    format_error \
        "Build failed" \
        "Check the build output above for specific errors. Common fixes:
  • Run 'bun install' to ensure dependencies are installed
  • Check for TypeScript compilation errors  
  • Ensure all source files are valid" \
        "INSTALL_004"
}

install_error_global_install_failed() {
    format_error \
        "Global installation failed" \
        "Try these solutions:
  • Run 'bun unlink' first to clean previous installations
  • Check if you have write permissions to global directories
  • Try running with elevated permissions if necessary" \
        "INSTALL_005"
}

install_error_binary_not_found() {
    format_error \
        "Installation failed - mzsh binary not found" \
        "The installation completed but the binary wasn't created. Try:
  • Re-running the installation: bun run inst
  • Checking if the build step completed successfully
  • Manually checking if ~/.bun/bin/mzsh exists" \
        "INSTALL_006"
}

install_error_command_not_accessible() {
    format_error \
        "Installation failed - mzsh command not accessible" \
        "The binary exists but isn't accessible. Try:
  • Adding ~/.bun/bin to your PATH
  • Running 'source ~/.zshrc' (or your shell's config file)
  • Opening a new terminal window" \
        "INSTALL_007"
}

# Uninstallation error messages
uninstall_error_still_found() {
    local path="$1"
    format_error \
        "Uninstallation failed - mzsh still found at: $path" \
        "Manual removal required. Try these commands:
  • sudo rm -f '$path'
  • Check for multiple installations in different locations
  • Verify you have sufficient permissions" \
        "UNINSTALL_001"
}

uninstall_error_npm_removal_failed() {
    format_error \
        "Failed to remove npm global installation" \
        "Remove manually with elevated permissions:
  • sudo npm uninstall -g mzsh
  • Or check npm global directory permissions" \
        "UNINSTALL_002"
}

# Success messages (minimal)
install_success_completed() {
    format_success "🎉 mzsh installation completed successfully!"
}

uninstall_success_completed() {
    format_success "🎉 mzsh uninstallation completed!"
}

# Info messages
install_info_starting() {
    format_info "🚀 Installing mzsh globally..."
}

uninstall_info_starting() {
    format_info "🗑️  Uninstalling mzsh..."
}

install_info_shell_refresh() {
    format_info "Starting new shell session to apply changes..."
}

uninstall_info_shell_refresh() {
    format_info "Starting new shell session to apply changes..."
}

# Uninstall error messages
uninstall_error_still_found() {
    local remaining_path="$1"
    format_error \
        "Uninstallation failed - mzsh still found" \
        "Manual removal required. Try these commands:
  • sudo rm -f $remaining_path
  • Check for multiple installations in different locations
  • Verify you have sufficient permissions" \
        "UNINSTALL_001"
}

uninstall_error_npm_removal_failed() {
    format_error \
        "Failed to remove npm global installation" \
        "Remove manually with elevated permissions:
  • sudo npm uninstall -g mzsh
  • Or check npm global directory permissions" \
        "UNINSTALL_002"
}

uninstall_error_permission_denied() {
    format_error \
        "Permission denied during uninstallation" \
        "Some files require elevated permissions:
  • Try running with sudo for system-wide installations
  • Check file ownership and permissions
  • Ensure you have write access to installation directories" \
        "UNINSTALL_003"
}

uninstall_error_binary_removal_failed() {
    format_error \
        "Failed to remove mzsh binary files" \
        "Manual removal may be required:
  • Check if files are in use by other processes
  • Try running with elevated permissions: sudo ./uninstall.sh
  • Manually remove files from ~/.bun/bin/ if they exist" \
        "UNINSTALL_004"
}

uninstall_error_directory_removal_failed() {
    format_error \
        "Failed to remove mzsh package directories" \
        "Manual cleanup may be required:
  • Check directory permissions
  • Try running with elevated permissions if needed
  • Manually remove directories if they contain important data" \
        "UNINSTALL_005"
}
