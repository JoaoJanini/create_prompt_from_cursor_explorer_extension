// extension.js (v0.0.6) – minimal diff: adds token counts & sizes
// Requires the `tiktoken` package (`npm i tiktoken`).
// ────────────────────────────────────────────────────────────
const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');
let encoder; // lazy‑init tiktoken once

/* ─────────── helpers ─────────── */
const { get_encoding } = (() => {
  try { return require('tiktoken'); }
  catch { return { get_encoding: () => ({ encode: (s) => s.split(/\s+/) }) }; /* fallback */ }
})();
function initEncoder() {
  if (!encoder) encoder = get_encoding('cl100k_base');
}
function countTokens(str) {
  initEncoder();
  return encoder.encode(str).length;
}
function detectLang(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (["js","jsx","cjs","mjs"].includes(ext)) return "javascript";
  if (["ts","tsx"].includes(ext))            return "typescript";
  if (ext === "json")                         return "json";
  if (ext === "md")                           return "markdown";
  return "";
}
function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
function gatherFiles(dirUri, out = []) {
  fs.readdirSync(dirUri.fsPath).forEach((c) => {
    const child = vscode.Uri.file(path.join(dirUri.fsPath, c));
    fs.statSync(child.fsPath).isDirectory() ? gatherFiles(child, out) : out.push(child.fsPath);
  });
  return out;
}

/* ───── build tree, collect metadata & token totals ───── */
function prepare(selectedUris) {
  const filePaths   = new Set();
  const folderPaths = new Set();
  selectedUris.forEach((u) => {
    const stat = fs.statSync(u.fsPath);
    if (stat.isDirectory()) {
      folderPaths.add(u.fsPath);
      gatherFiles(u).forEach((p) => filePaths.add(p));
    } else {
      filePaths.add(u.fsPath);
    }
  });

  // compute per‑file meta (tokens, size) & total tokens
  const meta = new Map();
  let totalTokens = 0;
  filePaths.forEach((p) => {
    const code   = fs.readFileSync(p, 'utf8');
    const tkn    = countTokens(code);
    const size   = fs.statSync(p).size;
    meta.set(p, { tokens: tkn, size });
    totalTokens += tkn;
  });

  /* build in‑memory dir tree */
  const root = { name: '', isFile: false, children: new Map() };
  function addPath(fsPath, isFile) {
    const rel  = vscode.workspace.asRelativePath(fsPath, false);
    const parts = rel.split(/[\\/]/);
    let node = root;
    parts.forEach((part, idx) => {
      if (!node.children.has(part)) node.children.set(part, { name: part, isFile: false, children: new Map() });
      node = node.children.get(part);
      if (idx === parts.length - 1) node.isFile = isFile;
    });
  }
  [...filePaths].forEach((p) => addPath(p, true));
  [...folderPaths].forEach((p) => addPath(p, false));

  /* render with collapsing */
  const lines = [];
  function render(node, prefix, rootLevel) {
    const kids = [...node.children.values()].sort((a,b)=>a.name.localeCompare(b.name));
    kids.forEach((child, idx) => {
      let label = child.name;
      let curr  = child;
      while (!curr.isFile && curr.children.size === 1) {
        const only = [...curr.children.values()][0];
        if (only.isFile) break;
        label += `/${only.name}`;
        curr = only;
      }
      const isLast   = idx === kids.length-1;
      const branch   = rootLevel ? '' : prefix + (isLast ? '└── ' : '├── ');
      const newPref  = rootLevel ? '' : prefix + (isLast ? '    ' : '│   ');
      const icon     = curr.isFile ? '📄' : '📁';
      const lineLab  = curr.isFile ? `${label}` : `${label}/`;
      const metaPart = curr.isFile ? (() => { const m=meta.get(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, lineLab)); if(!m) return ''; return ` (${m.tokens} tok, ${formatSize(m.size)})`; })() : '';
      lines.push(`${branch}${icon} ${lineLab}${metaPart}`);
      if (!curr.isFile) render(curr, newPref, false);
    });
  }
  render(root, '', true);
  return { tree: lines.join('\n'), filePaths: [...filePaths], totalTokens };
}

function dumpFilesMarkdown(paths) {
  return paths.map((p) => {
    const rel  = vscode.workspace.asRelativePath(p, false);
    const code = fs.readFileSync(p, 'utf8');
    return `## File: \`${rel}\`\n\`\`\`${detectLang(rel)}\n${code}\n\`\`\`\n`;
  }).join('\n');
}

/* ─────────── activation ─────────── */
function activate(context) {
  const disposable = vscode.commands.registerCommand('copyFileTree.copy', async (clicked, multi) => {
    try {
      const sel = multi && multi.length ? multi : [clicked];
      const { tree, filePaths, totalTokens } = prepare(sel);
      const md = `**Total tokens:** ${totalTokens}\n\n# File Tree\n\n${tree}\n\n${dumpFilesMarkdown(filePaths)}`;
      await vscode.env.clipboard.writeText(md);
      vscode.window.setStatusBarMessage('📋 File tree copied with tokens.', 3000);
    } catch (e) {
      vscode.window.showErrorMessage(`Copy File Tree: ${e.message || e}`);
    }
  });
  context.subscriptions.push(disposable);
}
function deactivate() {}
module.exports = { activate, deactivate };
