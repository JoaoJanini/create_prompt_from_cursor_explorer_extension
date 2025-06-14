// extension.js (v0.1.0) – performance‑optimised & memory‑safe
// ────────────────────────────────────────────────────────────
const vscode  = require('vscode');
const fsSync  = require('fs');              // sync helpers only when unavoidable
const fs      = require('fs/promises');     // async‑first I/O
const path    = require('path');
const ignore  = require('ignore');

/* ─────────── helpers ─────────── */
function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/* ─────────── in‑memory history (last 20) ─────────── */
const HISTORY_MAX = 20;
// each entry: { ts:number, paths:string[], preview:string }
const history = [];

/* ─────────── per‑file content cache ─────────── */
// key   = absolute fsPath
// value = { mtimeMs: number, size: number, segment: string }
const contentCache = new Map();

/* --- language detection (cached once per process) --- */
let extensionLangMap;
function buildExtensionLangMap() {
  if (extensionLangMap) { return; }
  const languageMap = require('language-map');
  extensionLangMap = {};
  for (const lang of Object.keys(languageMap)) {
    const data = languageMap[lang];
    const ace  = data.ace_mode || lang.toLowerCase();
    (data.extensions || []).forEach(ext => { extensionLangMap[ext] = ace; });
  }
}
function detectLang(file) {
  if (!extensionLangMap) { buildExtensionLangMap(); }
  return extensionLangMap[path.extname(file).toLowerCase()] || '';
}

/* ─────────── configuration helpers ─────────── */
const getConfig           = () => vscode.workspace.getConfiguration('filePrompt');
const isUnwantedExtension = (p) => getConfig()
  .get('ignoredExtensions', [])
  .includes(path.extname(p).toLowerCase());

/* --- .gitignore processing: cached per workspace --- */
const ignoreCache = new Map();   // workspaceRoot → ignore() instance
async function buildIgnoreFilter(workspaceRoot) {
  const ig = ignore();

  // find *all* .gitignore files once
  const gitignoreFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceRoot, '**/.gitignore'),
    '**/node_modules/**'
  );

  await Promise.all(
    gitignoreFiles.map(async (uri) => {
      const content = await fs.readFile(uri.fsPath, 'utf8');
      ig.add(content);
    })
  );

  return ig;
}
async function getIgnoreFilter(workspaceRoot) {
  if (!ignoreCache.has(workspaceRoot)) {
    ignoreCache.set(workspaceRoot, buildIgnoreFilter(workspaceRoot));
  }
  return ignoreCache.get(workspaceRoot);
}
async function isIgnored(fsPath, workspaceRoot, ig) {
  const rel = path.relative(workspaceRoot, fsPath).replace(/\\/g, '/');
  return ig.ignores(rel);
}

/* --- extra ignore list (cheap test) --- */
const isExtraIgnored = (fsPath, workspaceRoot) => {
  const extra = getConfig().get('extraIgnoredFiles', []);
  const rel   = path.relative(workspaceRoot, fsPath).replace(/\\/g, '/');
  return extra.some(ignored => rel === ignored || rel.startsWith(ignored + '/'));
};

/* ─────────── file system traversal (fully async) ─────────── */
async function gatherFiles(startUri, ig, out /* Set */) {
  const entries = await fs.readdir(startUri.fsPath, { withFileTypes: true });

  await Promise.all(entries.map(async (dirent) => {
    if (dirent.name === '.git') { return; }                        // always skip
    const child = vscode.Uri.file(path.join(startUri.fsPath, dirent.name));

    if (
      (await isIgnored(child.fsPath, ig._base, ig)) ||
      isUnwantedExtension(child.fsPath) ||
      isExtraIgnored(child.fsPath, ig._base)
    ) { return; }

    if (dirent.isDirectory()) {
      await gatherFiles(child, ig, out);
    } else {
      out.add(child.fsPath);
    }
  }));
}

/* ───── prepare markdown & tree ───── */
async function prepare(selectedUris) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { throw new Error('No workspace folder is open.'); }

  const ig                = await getIgnoreFilter(workspaceRoot);
  ig._base                = workspaceRoot;     // helper for isIgnored()
  const filePaths         = new Set();
  const foldersExplicitly = new Set();

  await Promise.all(selectedUris.map(async (u) => {
    if (
      (await isIgnored(u.fsPath, workspaceRoot, ig)) ||
      isUnwantedExtension(u.fsPath) ||
      isExtraIgnored(u.fsPath, workspaceRoot)
    ) { return; }

    const stat = await fs.stat(u.fsPath);
    if (stat.isDirectory()) {
      foldersExplicitly.add(u.fsPath);
      await gatherFiles(u, ig, filePaths);
    } else {
      filePaths.add(u.fsPath);
    }
  }));

  /* ---- compute metadata (size) in parallel ---- */
  const meta = new Map();           // fsPath → size
  let totalSize = 0;
  await Promise.all(
    [...filePaths].map(async (p) => {
      const { size } = await fs.stat(p);
      meta.set(p, size);
      totalSize += size;
    })
  );

  /* ---- build in‑memory tree (iterative) ---- */
  const root = { name: '', isFile: false, children: new Map(), fsPath: null };
  const ensureNode = (parts) => {
    let node = root;
    parts.forEach(part => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, isFile: false, children: new Map(), fsPath: null });
      }
      node = node.children.get(part);
    });
    return node;
  };

  for (const p of filePaths) {
    const relParts   = vscode.workspace.asRelativePath(p, false).split(/[\\/]/);
    const leaf       = ensureNode(relParts);
    leaf.isFile      = true;
    leaf.fsPath      = p;
  }

  /* ---- remove empty dirs (post‑order) ---- */
  (function prune(node) {
    for (const [k, child] of node.children) {
      prune(child);
      if (!child.isFile && child.children.size === 0) { node.children.delete(k); }
    }
  })(root);

  /* ---- render ---- */
  const lines = [];
  (function render(node, prefix, isRoot) {
    const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
    kids.forEach((child, i) => {
      // directory collapsing
      let label = child.name;
      let curr  = child;
      while (!curr.isFile && curr.children.size === 1) {
        const only = [...curr.children.values()][0];
        if (only.isFile) { break; }
        label += `/${only.name}`;
        curr  = only;
      }

      const isLast  = i === kids.length - 1;
      const branch  = isRoot ? '' : prefix + (isLast ? '└── ' : '├── ');
      const newPref = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
      const icon    = curr.isFile ? '📄' : '📁';

      const metaPart = curr.isFile
        ? ` (${formatSize(meta.get(curr.fsPath))})`
        : '';

      lines.push(`${branch}${icon} ${label}${curr.isFile ? '' : '/'}${metaPart}`);

      if (!curr.isFile) { render(curr, newPref, false); }
    });
  })(root, '', true);

  return { tree: lines.join('\n'), filePaths: [...filePaths], totalSize };
}

/* ---- markdown assembly ---- */
async function dumpFilesMarkdown(paths) {
  const segments = await Promise.all(
    paths.map(async (p) => {
      const { size, mtimeMs } = await fs.stat(p);        // cheap, needed for cache key
      const cached = contentCache.get(p);
      if (cached && cached.size === size && cached.mtimeMs === mtimeMs) {
        return cached.segment;                           // unchanged → reuse
      }

      const rel     = vscode.workspace.asRelativePath(p, false);
      const code    = await fs.readFile(p, 'utf8');
      const segment = `## File: \`${rel}\`\n\`\`\`${detectLang(rel)}\n${code}\n\`\`\`\n`;

      contentCache.set(p, { size, mtimeMs, segment });   // update cache
      return segment;
    })
  );
  return segments.join('\n');
}

/* ─────────── activation ─────────── */
function activate(context) {

  /* ── ❶ single‑flight state ───────────────────────────────── */
  let jobRunning = false;      // true while prepare() + clipboard are executing
  let queuedSel  = null;       // last selection received while a job is running

  async function runCopy(selection) {
    if (jobRunning) {          // already busy → remember latest request and return
      queuedSel = selection;
      return;
    }
    jobRunning = true;
    const t0 = Date.now();
    let files = 0;
    let bytes = 0;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification,
          title: 'Copying file tree…',
          cancellable: false },
        async () => {
          const { tree, filePaths, totalSize } = await prepare(selection);
          files = filePaths.length;
          bytes = totalSize;
          const md = `# File Tree\n\n${tree}\n\n${await dumpFilesMarkdown(filePaths)}`;
          await vscode.env.clipboard.writeText(md);

          /* record history (preview = first 4 lines of tree) */
          history.unshift({
            ts: Date.now(),
            paths: selection.map(u => u.fsPath),
            preview: tree.split('\n').slice(0, 4).join('⏎ ')
          });
          if (history.length > HISTORY_MAX) history.pop();
        }
      );

      const secs  = ((Date.now() - t0) / 1000).toFixed(2);
      const parts = [
        `📋 Copied ${files} file${files !== 1 ? 's' : ''}`,
        `(${formatSize(bytes)})`,
        `in ${secs}s`
      ];
      if (getConfig().get('respectGitignore', true)) parts.push('(respecting .gitignore)');
      vscode.window.setStatusBarMessage(parts.join(' '), 5000);
    } catch (err) {
      vscode.window.showErrorMessage(`FilePrompt: ${err.message || err}`);
    } finally {
      jobRunning = false;
      if (queuedSel) {               // run the most‑recently‑queued request
        const next = queuedSel;
        queuedSel = null;
        setImmediate(() => runCopy(next));   // yield → keep UI responsive
      }
    }
  }

  /* automatically clear ignore cache when user edits a .gitignore */
  const watcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
  watcher.onDidChange  (() => ignoreCache.clear());
  watcher.onDidCreate  (() => ignoreCache.clear());
  watcher.onDidDelete  (() => ignoreCache.clear());
  context.subscriptions.push(watcher);

  /* ── ❷ command now delegates to runCopy() ── */
  const copyCommand = vscode.commands.registerCommand(
    'filePrompt.copy',
    (clicked, multi) => {
      const sel = multi?.length ? multi : [clicked];
      runCopy(sel);
    }
  );

  const addIgnoreCmd = vscode.commands.registerCommand('filePrompt.addToIgnoreList', async () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return vscode.window.showErrorMessage('No active file'); }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root)  { return vscode.window.showErrorMessage('No workspace found'); }

      const rel  = path.relative(root, editor.document.uri.fsPath).replace(/\\/g, '/');
      const cfg  = vscode.workspace.getConfiguration('filePrompt');
      const list = cfg.get('extraIgnoredFiles', []);

      if (list.includes(rel)) {
        return vscode.window.showInformationMessage(`"${rel}" is already ignored`);
      }
      await cfg.update('extraIgnoredFiles', [...list, rel], vscode.ConfigurationTarget.Workspace);
      ignoreCache.clear();                               // keep behaviour consistent
      vscode.window.showInformationMessage(`Added "${rel}" to ignore list`);
    } catch (err) {
      vscode.window.showErrorMessage(`Add to ignore list: ${err.message || err}`);
    }
  });

  const removeIgnoreCmd = vscode.commands.registerCommand('filePrompt.removeFromIgnoreList', async () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return vscode.window.showErrorMessage('No active file'); }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root)  { return vscode.window.showErrorMessage('No workspace found'); }

      const rel  = path.relative(root, editor.document.uri.fsPath).replace(/\\/g, '/');
      const cfg  = vscode.workspace.getConfiguration('filePrompt');
      const list = cfg.get('extraIgnoredFiles', []);

      if (!list.includes(rel)) {
        return vscode.window.showInformationMessage(`"${rel}" is not in the ignore list`);
      }
      const updatedList = list.filter(item => item !== rel);
      await cfg.update('extraIgnoredFiles', updatedList, vscode.ConfigurationTarget.Workspace);
      ignoreCache.clear();                               // keep behaviour consistent
      vscode.window.showInformationMessage(`Removed "${rel}" from ignore list`);
    } catch (err) {
      vscode.window.showErrorMessage(`Remove from ignore list: ${err.message || err}`);
    }
  });

  context.subscriptions.push(copyCommand, addIgnoreCmd, removeIgnoreCmd);

  /* ── ❸ history command ───────────────────────────── */
  const histCmd = vscode.commands.registerCommand('filePrompt.showHistory', () => {
    if (history.length === 0) {
      return vscode.window.showInformationMessage('FilePrompt: no history yet.');
    }

    // Get saved stacks to check for matches
    const cfg = vscode.workspace.getConfiguration('filePrompt');
    const stacks = cfg.get('savedStacks', []);

    const saveButton = {
      iconPath: new vscode.ThemeIcon('save'),
      tooltip:   'Save as stack'
    };

    const deleteButton = {
      iconPath: new vscode.ThemeIcon('trash'),
      tooltip:   'Delete stack'
    };

    const qp = vscode.window.createQuickPick();
    qp.matchOnDetail = true;
    qp.placeholder   = 'Select to re‑copy · click 💾 to save as stack · click 🗑️ to delete stack';
    qp.items = history.map((h, i) => {
      // Check if this history entry matches any saved stack
      const matchingStack = stacks.find(stack => {
        if (stack.paths.length !== h.paths.length) return false;
        const sortedStackPaths = [...stack.paths].sort();
        const sortedHistoryPaths = [...h.paths].sort();
        return sortedStackPaths.every((path, i) => path === sortedHistoryPaths[i]);
      });

      return {
        label:       matchingStack 
          ? `📚 ${matchingStack.name}`
          : `${i + 1}. ${h.preview}`,
        description: new Date(h.ts).toLocaleTimeString(),
        detail:      `${h.paths.length} file${h.paths.length !== 1 ? 's' : ''}`,
        idx:         i,
        matchingStack: matchingStack,
        buttons:     matchingStack ? [deleteButton] : [saveButton] // Show delete for stacks, save for non-stacks
      };
    });

    /* re‑copy on single selection */
    qp.onDidAccept(() => {
      const sel = qp.selectedItems[0];
      if (sel) {
        const entry = history[sel.idx];
        qp.hide();
        runCopy(entry.paths.map(p => vscode.Uri.file(p)));
      }
    });

    /* save/delete button */
    qp.onDidTriggerItemButton(async (e) => {
      const entry = history[e.item.idx];
      
      if (e.item.matchingStack) {
        // Delete stack
        const confirm = await vscode.window.showWarningMessage(
          `Delete stack "${e.item.matchingStack.name}"?`,
          'Delete', 'Cancel'
        );
        if (confirm !== 'Delete') return;

        const cfg = vscode.workspace.getConfiguration('filePrompt');
        const currentStacks = cfg.get('savedStacks', []);
        const updatedStacks = currentStacks.filter(stack => stack.name !== e.item.matchingStack.name);
        await cfg.update('savedStacks', updatedStacks, vscode.ConfigurationTarget.Workspace);
        
        // Refresh the history view to update stack indicators
        qp.hide();
        vscode.window.showInformationMessage(`Deleted stack "${e.item.matchingStack.name}".`);
        // Re-run the command to refresh the view
        vscode.commands.executeCommand('filePrompt.showHistory');
      } else {
        // Save as new stack
        qp.busy = true;
        const name = await vscode.window.showInputBox({ prompt: 'Stack name', value: '' });
        qp.busy = false;
        if (!name) { return; }

        const cfg = vscode.workspace.getConfiguration('filePrompt');
        const stacks = cfg.get('savedStacks', []);
        stacks.push({ name, paths: entry.paths });
        await cfg.update('savedStacks', stacks, vscode.ConfigurationTarget.Workspace);
        
        // Refresh the history view to show the new stack
        qp.hide();
        vscode.window.showInformationMessage(`Saved as stack "${name}".`);
        // Re-run the command to refresh the view
        vscode.commands.executeCommand('filePrompt.showHistory');
      }
    });

    qp.show();
  });

  /* ── ❹ saved stacks command ───────────────────────────── */
  const stacksCmd = vscode.commands.registerCommand('filePrompt.copySavedStack', () => {
    const cfg = vscode.workspace.getConfiguration('filePrompt');
    const stacks = cfg.get('savedStacks', []);
    
    if (stacks.length === 0) {
      return vscode.window.showInformationMessage('FilePrompt: no saved stacks yet.');
    }

    const deleteButton = {
      iconPath: new vscode.ThemeIcon('trash'),
      tooltip: 'Delete stack'
    };

    const qp = vscode.window.createQuickPick();
    qp.matchOnDetail = true;
    qp.placeholder = 'Select to copy · click 🗑️ to delete stack';
    qp.items = stacks.map((stack, i) => ({
      label: `📚 ${stack.name}`,
      description: `${stack.paths.length} file${stack.paths.length !== 1 ? 's' : ''}`,
      detail: stack.paths.slice(0, 3).map(p => vscode.workspace.asRelativePath(p, false)).join(', ') + 
              (stack.paths.length > 3 ? `, +${stack.paths.length - 3} more...` : ''),
      idx: i,
      buttons: [deleteButton]
    }));

    /* copy on selection */
    qp.onDidAccept(async () => {
      const sel = qp.selectedItems[0];
      if (!sel) return;
      
      qp.hide();
      const chosen = stacks[sel.idx];
      
      // Check if files still exist (silently ignore missing ones)
      const existingPaths = [];
      
      await Promise.all(chosen.paths.map(async (p) => {
        try {
          await fs.stat(p);
          existingPaths.push(p);
        } catch {
          // Silently ignore missing files/directories
        }
      }));

      if (existingPaths.length === 0) {
        return vscode.window.showErrorMessage(`No files from stack "${chosen.name}" exist anymore.`);
      }

      // Copy immediately
      runCopy(existingPaths.map(p => vscode.Uri.file(p)));
    });

    /* delete button */
    qp.onDidTriggerItemButton(async (e) => {
      const stackToDelete = stacks[e.item.idx];
      const confirm = await vscode.window.showWarningMessage(
        `Delete stack "${stackToDelete.name}"?`,
        'Delete', 'Cancel'
      );
      if (confirm !== 'Delete') return;

      const updatedStacks = stacks.filter((_, i) => i !== e.item.idx);
      await cfg.update('savedStacks', updatedStacks, vscode.ConfigurationTarget.Workspace);
      
      // Refresh the quick pick
      qp.items = updatedStacks.map((stack, i) => ({
        label: `📚 ${stack.name}`,
        description: `${stack.paths.length} file${stack.paths.length !== 1 ? 's' : ''}`,
        detail: stack.paths.slice(0, 3).map(p => vscode.workspace.asRelativePath(p, false)).join(', ') + 
                (stack.paths.length > 3 ? `, +${stack.paths.length - 3} more...` : ''),
        idx: i,
        buttons: [deleteButton]
      }));

      if (updatedStacks.length === 0) {
        qp.hide();
        vscode.window.showInformationMessage('All stacks deleted.');
      } else {
        vscode.window.showInformationMessage(`Deleted stack "${stackToDelete.name}".`);
      }
    });

    qp.show();
  });

  context.subscriptions.push(histCmd, stacksCmd);
}

function deactivate() {}
module.exports = { activate, deactivate };
