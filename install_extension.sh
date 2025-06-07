#!/bin/bash

# Copy File Tree Extension Installer
# This script builds and installs the VS Code/Cursor extension locally

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect available editors
detect_editors() {
    local editors=()
    
    if command_exists code; then
        editors+=("VS Code")
        VSCODE_CMD="code"
    fi
    
    if command_exists cursor; then
        editors+=("Cursor")
        CURSOR_CMD="cursor"
    fi
    
    if command_exists code-insiders; then
        editors+=("VS Code Insiders")
        VSCODE_INSIDERS_CMD="code-insiders"
    fi
    
    echo "${editors[@]}"
}

# Function to install extension
install_extension() {
    local cmd="$1"
    local editor_name="$2"
    local vsix_file="$3"
    
    print_status "Installing extension in $editor_name..."
    
    if $cmd --install-extension "$vsix_file" 2>/dev/null; then
        print_success "Successfully installed in $editor_name"
        return 0
    else
        print_warning "Failed to install in $editor_name"
        return 1
    fi
}

# Main installation function
main() {
    print_status "Starting Copy File Tree Extension installation..."
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js first."
        print_status "Download from: https://nodejs.org/"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
    
    # Install vsce if not already installed
    if ! command_exists vsce; then
        print_status "Installing VS Code Extension CLI (vsce)..."
        if npm install -g @vscode/vsce; then
            print_success "vsce installed successfully"
        else
            print_error "Failed to install vsce"
            exit 1
        fi
    else
        print_status "vsce is already installed"
    fi
    
    # Install dependencies
    print_status "Installing project dependencies..."
    if npm install; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
    
    # Package the extension
    print_status "Packaging the extension..."
    if vsce package; then
        print_success "Extension packaged successfully"
    else
        print_error "Failed to package extension"
        exit 1
    fi
    
    # Find the generated .vsix file
    VSIX_FILE=$(find . -name "*.vsix" -type f | head -n 1)
    
    if [ -z "$VSIX_FILE" ]; then
        print_error "No .vsix file found after packaging"
        exit 1
    fi
    
    print_status "Found extension package: $VSIX_FILE"
    
    # Detect available editors
    print_status "Detecting available editors..."
    AVAILABLE_EDITORS=($(detect_editors))
    
    if [ ${#AVAILABLE_EDITORS[@]} -eq 0 ]; then
        print_error "No supported editors found (VS Code, Cursor, or VS Code Insiders)"
        print_status "Please install one of the following:"
        print_status "  - VS Code: https://code.visualstudio.com/"
        print_status "  - Cursor: https://cursor.sh/"
        exit 1
    fi
    
    print_success "Found editors: ${AVAILABLE_EDITORS[*]}"
    
    # Install in available editors
    local install_count=0
    
    if [ -n "$VSCODE_CMD" ]; then
        if install_extension "$VSCODE_CMD" "VS Code" "$VSIX_FILE"; then
            ((install_count++))
        fi
    fi
    
    if [ -n "$CURSOR_CMD" ]; then
        if install_extension "$CURSOR_CMD" "Cursor" "$VSIX_FILE"; then
            ((install_count++))
        fi
    fi
    
    if [ -n "$VSCODE_INSIDERS_CMD" ]; then
        if install_extension "$VSCODE_INSIDERS_CMD" "VS Code Insiders" "$VSIX_FILE"; then
            ((install_count++))
        fi
    fi
    
    # Summary
    echo
    if [ $install_count -gt 0 ]; then
        print_success "Installation completed! Extension installed in $install_count editor(s)."
        print_status "To use the extension:"
        print_status "  1. Open your editor"
        print_status "  2. Right-click on files/folders in the explorer"
        print_status "  3. Select 'Copy file tree to clipboard'"
        echo
        print_status "Extension file: $VSIX_FILE"
    else
        print_error "Failed to install extension in any editor"
        exit 1
    fi
}

# Show help
show_help() {
    echo "Copy File Tree Extension Installer"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -c, --clean    Remove generated files after installation"
    echo
    echo "This script will:"
    echo "  1. Install VS Code Extension CLI (vsce) if needed"
    echo "  2. Install project dependencies"
    echo "  3. Package the extension"
    echo "  4. Install in available editors (VS Code, Cursor, VS Code Insiders)"
}

# Parse command line arguments
CLEAN_AFTER=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -c|--clean)
            CLEAN_AFTER=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main

# Clean up if requested
if [ "$CLEAN_AFTER" = true ]; then
    print_status "Cleaning up generated files..."
    rm -f *.vsix
    print_success "Cleanup completed"
fi

print_success "All done! 🎉"


