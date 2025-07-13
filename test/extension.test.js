const fs = require('fs');
const path = require('path');
const os = require('os');
const mock = require('mock-require');
const { expect } = require('chai');

process.env.NODE_ENV = 'test';

// helper to load extension with a fresh vscode mock
function loadExtension(workspaceRoot, cfg = {}) {
  const config = Object.assign({
    respectGitignore: true,
    ignoredExtensions: [],
    extraIgnoredFiles: [],
    savedStacks: []
  }, cfg);
  const commands = {};
  mock('vscode', {
    workspace: {
      getConfiguration: () => ({
        get: (k, d) => (k in config ? config[k] : d),
        update: (k, v) => { config[k] = v; return Promise.resolve(); }
      }),
      workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
      asRelativePath: (p) => path.relative(workspaceRoot, p).replace(/\\/g, '/'),
      findFiles: async () => [{ fsPath: path.join(workspaceRoot, '.gitignore') }],
      createFileSystemWatcher: () => ({
        onDidChange: () => {},
        onDidCreate: () => {},
        onDidDelete: () => {},
        dispose: () => {}
      })
    },
    window: {
      withProgress: async (_o, cb) => cb(),
      showErrorMessage: () => {},
      showInformationMessage: () => {},
      setStatusBarMessage: () => {},
      createQuickPick: () => ({
        show: () => {},
        hide: () => {},
        onDidAccept: () => {},
        onDidTriggerItemButton: () => {}
      }),
      activeTextEditor: null,
      showInputBox: async () => ''
    },
    env: { clipboard: { writeText: async () => {} } },
    commands: {
      registerCommand: (n, fn) => { commands[n] = fn; return { dispose: () => {} }; },
      executeCommand: () => {}
    },
    ProgressLocation: {},
    ConfigurationTarget: { Workspace: 1 },
    Uri: { file: (p) => ({ fsPath: p }) },
    ThemeIcon: function() {},
    RelativePattern: function(base, pattern) {
      this.base = base; this.pattern = pattern;
    }
  });
  delete require.cache[require.resolve('../extension')];
  const ext = require('../extension');
  return { ext, commands, config };
}

describe('helper functions', () => {
  const { ext } = loadExtension(os.tmpdir());
  it('formatSize handles bytes', () => {
    expect(ext.formatSize(500)).to.equal('500 B');
  });
  it('formatSize handles kilobytes', () => {
    expect(ext.formatSize(2048)).to.equal('2.0 KB');
  });
  it('detectLang detects js extension', () => {
    const lang = ext.detectLang('file.js');
    expect(lang).to.include('javascript');
  });
});

describe('file gathering and markdown', () => {
  let rootDir;
  let ext;
  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
    // setup files
    fs.writeFileSync(path.join(rootDir, 'keep.js'), 'console.log("hi");');
    fs.writeFileSync(path.join(rootDir, 'ignore.log'), 'ignore');
    fs.mkdirSync(path.join(rootDir, 'sub'));
    fs.writeFileSync(path.join(rootDir, 'sub', 'nested.txt'), 'inside');
    fs.mkdirSync(path.join(rootDir, 'ignoreDir'));
    fs.writeFileSync(path.join(rootDir, 'ignoreDir', 'bad.js'), 'bad');
    fs.writeFileSync(path.join(rootDir, 'extra.txt'), 'extra');
    fs.writeFileSync(path.join(rootDir, '.gitignore'), 'ignoreDir/\nignore.log\n');

    ({ ext } = loadExtension(rootDir, {
      ignoredExtensions: ['.log'],
      extraIgnoredFiles: ['extra.txt']
    }));
  });
  afterEach(() => {
    mock.stopAll();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('isExtraIgnored checks relative paths', () => {
    const p = path.join(rootDir, 'extra.txt');
    expect(ext.isExtraIgnored(p, rootDir)).to.be.true;
  });

  it('prepare respects gitignore and config', async () => {
    const vs = require('vscode');
    const res = await ext.prepare([
      vs.Uri.file(path.join(rootDir, 'keep.js')),
      vs.Uri.file(path.join(rootDir, 'sub'))
    ]);
    const files = res.filePaths.map(p => path.relative(rootDir, p)).sort();
    expect(files).to.deep.equal(['keep.js', 'sub/nested.txt']);
    expect(res.tree).to.match(/keep.js/);
    expect(res.tree).to.match(/nested.txt/);
  });

  it('dumpFilesMarkdown outputs fenced code with language', async () => {
    const file = path.join(rootDir, 'keep.js');
    const out1 = await ext.dumpFilesMarkdown([file]);
    expect(out1).to.include('```javascript');
    expect(out1).to.include('console.log');

    // modify file to ensure cache refresh
    await fs.promises.writeFile(file, 'console.log("changed");');
    const out2 = await ext.dumpFilesMarkdown([file]);
    expect(out2).to.include('changed');
    expect(out2).to.not.equal(out1);
  });
});

describe('ignore list commands', () => {
  let rootDir;
  let ext;
  let commands;
  let config;
  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-cmd-'));
    fs.writeFileSync(path.join(rootDir, 'foo.js'), 'foo');
    ({ ext, commands, config } = loadExtension(rootDir));
    const vs = require('vscode');
    vs.window.activeTextEditor = { document: { uri: { fsPath: path.join(rootDir, 'foo.js') } } };
    ext.activate({ subscriptions: [] });
  });
  afterEach(() => {
    mock.stopAll();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('add/remove ignore list modifies configuration', async () => {
    await commands['filePrompt.addToIgnoreList']();
    expect(config.extraIgnoredFiles).to.include('foo.js');
    await commands['filePrompt.removeFromIgnoreList']();
    expect(config.extraIgnoredFiles).to.not.include('foo.js');
  });
});
