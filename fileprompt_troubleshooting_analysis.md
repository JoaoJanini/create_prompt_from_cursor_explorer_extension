# FilePrompt Extension - Troubleshooting Analysis

## Overview
The FilePrompt extension is a VS Code/Cursor extension that copies selected files and directories as a structured Markdown tree with complete file contents. Based on code analysis, several factors can cause the extension to fail or appear to not work on certain repositories.

## Common Issues and Root Causes

### 1. **Workspace Dependency Issues**
**Problem**: Extension requires an open workspace folder
- **Code Location**: `extension.js:109`
- **Error**: `"No workspace folder is open."`
- **Impact**: Extension completely fails if no workspace is open
- **Solution**: Ensure VS Code/Cursor has a workspace folder open

### 2. **Gitignore Filtering (Most Common)**
**Problem**: Files are ignored based on .gitignore patterns
- **Default Setting**: `filePrompt.respectGitignore: true`
- **Code Location**: `extension.js:45-67` (buildIgnoreFilter function)
- **Impact**: Files matching .gitignore patterns are silently excluded
- **Symptoms**: 
  - Extension appears to work but copies fewer files than expected
  - Entire directories might be excluded
  - No error message shown
- **Solution**: 
  - Set `filePrompt.respectGitignore: false` in VS Code settings
  - Review your .gitignore files for overly broad patterns

### 3. **File Extension Filtering**
**Problem**: Many file types are ignored by default
- **Default Ignored Extensions**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.svg`, `.ico`, `.webp`, `.tiff`, `.mp3`, `.mp4`, `.avi`, `.mov`, `.wav`, `.zip`, `.rar`, `.tar`, `.gz`, `.7z`, `.exe`, `.dll`, `.bin`, `.dat`, `.db`, `.sqlite`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`, `.lock`, `.log`, `.tmp`, `.temp`, `.cache`
- **Code Location**: `extension.js:43-46` (isUnwantedExtension function)
- **Impact**: Files with these extensions are completely ignored
- **Solution**: Modify `filePrompt.ignoredExtensions` setting to remove unwanted filters

### 4. **Extra Ignored Files Configuration**
**Problem**: Additional files configured to be ignored
- **Setting**: `filePrompt.extraIgnoredFiles`
- **Code Location**: `extension.js:68-72` (isExtraIgnored function)
- **Impact**: Specific files or directories are excluded
- **Solution**: Check and modify the `filePrompt.extraIgnoredFiles` setting

### 5. **File System Permission Issues**
**Problem**: Cannot read files or directories due to permissions
- **Code Locations**: 
  - `extension.js:74-88` (gatherFiles function)
  - `extension.js:195-207` (dumpFilesMarkdown function)
- **Impact**: Extension silently fails or shows permission errors
- **Symptoms**: 
  - Files appear in tree but not in content
  - Partial failures
- **Solution**: Check file/directory permissions

### 6. **Binary File Handling**
**Problem**: Extension tries to read all files as UTF-8 text
- **Code Location**: `extension.js:202` (`fs.readFile(p, 'utf8')`)
- **Impact**: Binary files may cause encoding errors or produce garbled output
- **Risk**: Files like images, executables, or other binary data
- **Solution**: Ensure only text files are selected, or add binary files to ignored extensions

### 7. **Memory and Performance Issues**
**Problem**: Large files or many files can cause memory issues
- **Code Location**: `extension.js:195-207` (dumpFilesMarkdown function)
- **Impact**: Extension may hang, crash, or timeout
- **Symptoms**: 
  - Extension appears to hang during "Copying file tree..." progress
  - VS Code/Cursor becomes unresponsive
  - No completion message
- **Solution**: Select fewer files or exclude large files

### 8. **Language Detection Dependencies**
**Problem**: Missing or corrupted language-map dependency
- **Code Location**: `extension.js:26-38` (buildExtensionLangMap function)
- **Impact**: File language detection fails, may cause extension to crash
- **Solution**: Reinstall the extension or check dependencies

### 9. **Path Resolution Issues**
**Problem**: Issues with path handling, especially on Windows
- **Code Location**: `extension.js:60-62` (isIgnored function)
- **Impact**: Files may be incorrectly ignored or paths may not resolve
- **Symptoms**: Extension works differently on different operating systems
- **Solution**: Check for path separator issues (`\` vs `/`)

### 10. **Context Menu Not Appearing**
**Problem**: Right-click context menu option missing
- **Code Location**: `package.json:54-58` (menu configuration)
- **Cause**: Extension not properly activated or registered
- **Solution**: 
  - Restart VS Code/Cursor
  - Check if extension is enabled
  - Verify extension installation

### 11. **Silent Failures**
**Problem**: Extension appears to work but copies nothing
- **Code Location**: `extension.js:111-127` (prepare function)
- **Cause**: All selected files are filtered out by various rules
- **Symptoms**: 
  - Progress notification appears
  - Success message shows "Copied 0 files"
  - Clipboard contains only header with no content
- **Solution**: Review filtering settings and file selection

## Debugging Steps

### 1. **Check Basic Functionality**
```bash
# Verify extension is installed and enabled
# Check VS Code/Cursor extensions panel
```

### 2. **Review Configuration**
```json
{
  "filePrompt.respectGitignore": false,
  "filePrompt.ignoredExtensions": [],
  "filePrompt.extraIgnoredFiles": []
}
```

### 3. **Test with Simple Files**
- Create a test directory with simple `.txt` files
- Try copying just one file first
- Gradually add more complexity

### 4. **Check Error Messages**
- Look for error notifications in VS Code/Cursor
- Check VS Code/Cursor developer console (`Help > Toggle Developer Tools`)
- Look for FilePrompt-specific error messages

### 5. **Inspect Output**
- Check clipboard content after operation
- Look for the success status message
- Verify file count matches expectations

## Repository-Specific Issues

### Large Repositories
- **Issue**: Performance degradation with thousands of files
- **Solution**: Select specific subdirectories instead of entire repository

### Mono-repositories
- **Issue**: .gitignore patterns may be too broad
- **Solution**: Temporarily disable gitignore respect or adjust patterns

### Repositories with Binary Assets
- **Issue**: Many files filtered out by extension filters
- **Solution**: Adjust ignored extensions list

### Repositories with Complex Gitignore
- **Issue**: Nested .gitignore files create complex exclusion patterns
- **Solution**: Review all .gitignore files in the repository

## Recommended Solutions

### 1. **Create Debug Configuration**
```json
{
  "filePrompt.respectGitignore": false,
  "filePrompt.ignoredExtensions": [".jpg", ".png", ".gif"],
  "filePrompt.extraIgnoredFiles": []
}
```

### 2. **Use Incremental Testing**
1. Start with a single file
2. Add one directory at a time
3. Check what gets filtered out

### 3. **Monitor Resource Usage**
- Watch memory usage during operation
- Set reasonable limits on file selection

### 4. **Review Repository Structure**
- Check for deeply nested directories
- Look for symbolic links or special files
- Verify file permissions

## Conclusion

The FilePrompt extension's filtering mechanisms (gitignore, file extensions, extra ignored files) are the most common causes of apparent failures. The extension prioritizes excluding unwanted files over including everything, which can make it appear broken when it's actually working as designed. Most issues can be resolved by adjusting the configuration settings to be less restrictive.