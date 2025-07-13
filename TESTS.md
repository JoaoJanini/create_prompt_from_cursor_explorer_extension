# Test Suite Overview

The tests live in `test/extension.test.js` and run with Mocha. Each test ensures that the extension behaves correctly without requiring VS Code.

## Helper Function Tests

- **`formatSize`** – verifies that file sizes are formatted in bytes or kilobytes depending on input.
- **`detectLang`** – checks that the language detection logic recognizes the JavaScript file extension.

## File Gathering and Markdown

These tests create temporary directories and files to simulate a workspace:

- **`isExtraIgnored`** – ensures extra ignored paths from the configuration are detected using relative paths.
- **`prepare`** – validates that `.gitignore` patterns and ignored extensions are honoured when building the list of files. It also checks that the returned Markdown tree includes the expected file names.
- **`dumpFilesMarkdown`** – confirms that file contents are dumped with fenced code blocks and the correct language tag. The cache is cleared by modifying the file and verifying the output updates.

## Ignore List Commands

These tests exercise the commands registered by the extension:

- **`filePrompt.addToIgnoreList` / `filePrompt.removeFromIgnoreList`** – invoke the commands and verify that `extraIgnoredFiles` in the configuration is updated accordingly.

Run `npm test --silent` to execute all of the above.
