import * as vscode from 'vscode';
import { restoreEditors } from './commands';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('shipyard.reloadWorkspace', restoreEditors);
  context.subscriptions.push(disposable);

  restoreEditors();
}

export function deactivate() {}
