#!/bin/bash
npm i -g @vscode/vsce

npm install
# Build the extension
vsce package --allow-missing-repository 

# Install the extension
cursor --install-extension copy-file-tree-0.0.1.vsix


