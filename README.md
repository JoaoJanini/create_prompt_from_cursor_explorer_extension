# FilePrompt Extension

A VS Code/Cursor extension that copies selected files and directories as a structured Markdown tree with complete file contents. Perfect for sharing code context with AI assistants, creating documentation, or reporting issues.

## How to Use

- **Select multiple files and folders** in the VS Code/Cursor explorer
- **Right-click** and choose "Copy file tree to clipboard" 
- **Get a formatted output** that includes:
  - A visual directory tree structure in Markdown
  - Complete source code of each file in fenced code blocks
  - File sizes for easy reference

The output is optimized for pasting into:
- AI chat interfaces (ChatGPT, Claude, etc.)
- GitHub issues and discussions
- Documentation and wikis
- Code review tools

<div align="center">
  <table>
    <tr>
      <td align="center" colspan="2"><b>Context Menu</b></td>
    </tr>
    <tr>
      <td align="center" colspan="2"><img src="screenshots/context-menu-1.png" width="600" alt="Context Menu"></td>
    </tr>
      <td align="center"><b>File Tree Structure</b></td>
      <td align="center"><b>Clipboard Content</b></td>
    </tr>
    <tr>
      <td><img src="screenshots/file-tree.png" width="400" alt="File Tree"></td>
      <td><img src="screenshots/file-clipboard.png" width="400" alt="Clipboard Content"></td>
    </tr>
  </table>
</div>

## Configuration

Customize the extension behavior in VS Code settings (search for "FilePrompt"):

### Default Configuration Values

| Setting | Type | Default Value | Description |
|---------|------|---------------|-------------|
| `filePrompt.respectGitignore` | boolean | `true` | Ignore files and folders that match .gitignore patterns |
| `filePrompt.ignoredExtensions` | array | `[".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".ico", ".webp", ".tiff", ".tif", ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac", ".mkv", ".webm", ".m4a", ".ogg", ".zip", ".rar", ".tar", ".gz", ".7z", ".bz2", ".xz", ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".db", ".sqlite", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".ttf", ".otf", ".woff", ".woff2", ".eot", ".lock", ".log", ".tmp", ".temp", ".cache"]` | List of file extensions to ignore (include the dot, e.g., '.jpg') |
| `filePrompt.extraIgnoredFiles` | array | `[]` | Additional files and directories to ignore (relative paths from workspace root) |
| `filePrompt.savedStacks` | array | `[]` | Your saved file selection stacks (managed automatically) |

### Full Configuration JSON

```json
{
  "filePrompt.respectGitignore": {
    "type": "boolean",
    "default": true,
    "description": "Ignore files and folders that match .gitignore patterns"
  },
  "filePrompt.ignoredExtensions": {
    "type": "array",
    "default": [
      ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".ico", 
      ".webp", ".tiff", ".tif", ".mp3", ".mp4", ".avi", ".mov", 
      ".wav", ".flac", ".mkv", ".webm", ".m4a", ".ogg", ".zip", 
      ".rar", ".tar", ".gz", ".7z", ".bz2", ".xz", ".exe", 
      ".dll", ".so", ".dylib", ".bin", ".dat", ".db", ".sqlite", 
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", 
      ".ttf", ".otf", ".woff", ".woff2", ".eot", ".lock", 
      ".log", ".tmp", ".temp", ".cache"
    ],
    "description": "List of file extensions to ignore (include the dot, e.g., '.jpg')"
  },
  "filePrompt.extraIgnoredFiles": {
    "type": "array",
    "default": [],
    "description": "Additional files and directories to ignore (relative paths from workspace root)"
  },
  "filePrompt.savedStacks": {
    "type": "array",
    "default": [],
    "description": "Named file‑selection stacks saved from FilePrompt history. Each item has the shape { \"name\": string, \"paths\": string[] }."
  }
}
```

### Commands

The extension provides these commands:

1. **Copy file tree to clipboard** - The main functionality to copy selected files/folders as a structured Markdown tree
2. **FilePrompt: Add current file to ignore list** - Quickly add the currently open file to the `extraIgnoredFiles` configuration
3. **FilePrompt: Remove current file from ignore list** - Remove the currently open file from the ignore list
4. **FilePrompt: Show history** - View your last 20 copy operations and save/manage file selection stacks
5. **FilePrompt: Copy from saved stack** - Quick access to your saved file selection stacks
6. **FilePrompt: Add selection to stack** - Add the currently selected explorer items to a named stack

To use the "FilePrompt: Add current file to ignore list" command:
- Open any file in VS Code/Cursor
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "FilePrompt: Add current file to ignore list" and press Enter
- The file will be added to your workspace's `filePrompt.extraIgnoredFiles` setting

## Installation

### From VS Code Marketplace (Recommended)
1. Open VS Code/Cursor
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "FilePrompt"
4. Click Install


### Manual Installation (Development)

#### Prerequisites
- Node.js (version 14 or higher)
- VS Code or Cursor

#### Setup
```bash
# Clone the repository
git clone https://github.com/JoaoJanini/create_prompt_from_cursor_explorer_extension.git
cd create_prompt_from_cursor_explorer_extension

# Install dependencies
npm run full-install
```
