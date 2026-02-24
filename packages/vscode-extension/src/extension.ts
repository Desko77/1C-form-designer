/**
 * VS Code extension entry point for 1C Form Designer.
 */

import * as vscode from 'vscode';
import { FormEditorProvider } from './editor/form-editor-provider';
import { OUTPUT_CHANNEL_NAME } from '@1c-form-designer/shared';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine('1C Form Designer extension activated');

  // Register Custom Editor Provider
  const provider = new FormEditorProvider(context, outputChannel);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'formDesigner.managedForm',
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('formDesigner.previewDiff', () => {
      provider.previewDiff();
    }),
  );

  outputChannel.appendLine('Custom editor provider registered');
}

export function deactivate(): void {
  if (outputChannel) {
    outputChannel.appendLine('1C Form Designer extension deactivated');
    outputChannel.dispose();
  }
}
