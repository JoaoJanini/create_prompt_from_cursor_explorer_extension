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
const getConfig           = () => vscode.workspace.getConfiguration('copyFileTree');
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
      vscode.window.showErrorMessage(`Copy File Tree: ${err.message || err}`);
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
    'copyFileTree.copy',
    (clicked, multi) => {
      const sel = multi?.length ? multi : [clicked];
      runCopy(sel);
    }
  );

  const addIgnoreCmd = vscode.commands.registerCommand('copyFileTree.addToIgnoreList', async () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return vscode.window.showErrorMessage('No active file'); }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root)  { return vscode.window.showErrorMessage('No workspace found'); }

      const rel  = path.relative(root, editor.document.uri.fsPath).replace(/\\/g, '/');
      const cfg  = vscode.workspace.getConfiguration('copyFileTree');
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

  const removeIgnoreCmd = vscode.commands.registerCommand('copyFileTree.removeFromIgnoreList', async () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return vscode.window.showErrorMessage('No active file'); }

      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root)  { return vscode.window.showErrorMessage('No workspace found'); }

      const rel  = path.relative(root, editor.document.uri.fsPath).replace(/\\/g, '/');
      const cfg  = vscode.workspace.getConfiguration('copyFileTree');
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
  const histCmd = vscode.commands.registerCommand('copyFileTree.showHistory', async () => {
    if (history.length === 0) {
      return vscode.window.showInformationMessage('Copy File Tree: no history yet.');
    }

    const pick = await vscode.window.showQuickPick(
      history.map((h, i) => ({
        label: `${i + 1}. ${h.preview}`,
        description: new Date(h.ts).toLocaleTimeString(),
        detail: `${h.paths.length} file${h.paths.length !== 1 ? 's' : ''}`,
        idx: i
      })),
      { placeHolder: 'Select a previous copy' }
    );
    if (!pick) { return; }

    const action = await vscode.window.showQuickPick(
      ['Re-copy now', 'Save as named stack', 'Cancel'],
      { placeHolder: 'What do you want to do?' }
    );
    if (!action || action === 'Cancel') { return; }

    const chosen = history[pick.idx];

    if (action === 'Re-copy now') {
      runCopy(chosen.paths.map(p => vscode.Uri.file(p)));
    } else if (action === 'Save as named stack') {
      const name = await vscode.window.showInputBox({ prompt: 'Stack name' });
      if (!name) { return; }
      const cfg   = vscode.workspace.getConfiguration('copyFileTree');
      const stacks = cfg.get('savedStacks', []);
      stacks.push({ name, paths: chosen.paths });
      await cfg.update('savedStacks', stacks, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`Saved as stack "${name}".`);
    }
  });

  context.subscriptions.push(histCmd);
}

function deactivate() {}
module.exports = { activate, deactivate };
