const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

function qpStub() {
  let acceptCb = null;
  let hideCb = null;
  return {
    items: [],
    selectedItems: [],
    title: '',
    onDidAccept(cb) { acceptCb = cb; },
    onDidHide(cb)   { hideCb = cb; },
    show() {},
    hide() { if (hideCb) hideCb(); },
    dispose() {},
    triggerAccept() { return acceptCb ? acceptCb() : undefined; }
  };
}

suite('Stack commands', () => {
  const workspace = vscode.workspace.workspaceFolders[0];

  setup(async () => {
    const cfg = vscode.workspace.getConfiguration('filePrompt');
    await cfg.update('savedStacks', [], vscode.ConfigurationTarget.Workspace);
  });

  test('create new stack with selection', async () => {
    const file = path.join(workspace.uri.fsPath, 'foo.txt');
    const uri = vscode.Uri.file(file);

    const originalQP = vscode.window.createQuickPick;
    const originalInput = vscode.window.showInputBox;

    const qp = qpStub();
    vscode.window.createQuickPick = () => qp;
    vscode.window.showInputBox = async () => 'Stack1';

    await vscode.commands.executeCommand('filePrompt.addToStack', uri);
    qp.selectedItems = [qp.items[0]]; // "Create new stack"
    await qp.triggerAccept();

    const cfg = vscode.workspace.getConfiguration('filePrompt');
    const stacks = vscode.workspace.getConfiguration('filePrompt').get('savedStacks');

    assert.strictEqual(stacks.length, 1);
    assert.strictEqual(stacks[0].name, 'Stack1');
    assert.deepStrictEqual(stacks[0].paths, [file]);

    vscode.window.createQuickPick = originalQP;
    vscode.window.showInputBox = originalInput;
  });

  test('add to existing stack ignoring duplicates', async () => {
    const file1 = path.join(workspace.uri.fsPath, 'foo.txt');
    const file2 = path.join(workspace.uri.fsPath, 'bar.txt');

    const cfg = vscode.workspace.getConfiguration('filePrompt');
    await cfg.update('savedStacks', [{ name: 'Stack1', paths: [file1] }], vscode.ConfigurationTarget.Workspace);

    const originalQP = vscode.window.createQuickPick;
    const qp = qpStub();
    vscode.window.createQuickPick = () => qp;

    await vscode.commands.executeCommand('filePrompt.addToStack', undefined, [vscode.Uri.file(file1), vscode.Uri.file(file2)]);
    qp.selectedItems = [qp.items[1]]; // choose existing stack
    await qp.triggerAccept();

    const stacks = vscode.workspace.getConfiguration('filePrompt').get('savedStacks');
    assert.strictEqual(stacks[0].paths.length, 2);
    assert.deepStrictEqual(new Set(stacks[0].paths), new Set([file1, file2]));

    vscode.window.createQuickPick = originalQP;
  });
});
