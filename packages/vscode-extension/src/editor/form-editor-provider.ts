/**
 * Custom Editor Provider for 1C managed forms.
 * Manages the lifecycle of form editor instances.
 */

import * as vscode from 'vscode';
import {
  parseXmlToModel,
  serializeModelToXml,
  CommandEngine,
  createLayoutEngine,
  validateModel,
} from '@1c-form-designer/core-form';
import type {
  FormModel,
  FormPatch,
  ICommandEngine,
  ILayoutEngine,
  LayoutResult,
  Size,
} from '@1c-form-designer/core-form';
import type {
  ExtToUIMessage,
  UIToExtMessage,
  SerializedLayoutResult,
  UIState,
} from '@1c-form-designer/shared';
import { DEFAULT_CONFIG } from '@1c-form-designer/shared';

export class FormEditorProvider implements vscode.CustomTextEditorProvider {
  private activeEditor: FormEditorInstance | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const editor = new FormEditorInstance(
      document,
      webviewPanel,
      this.context,
      this.outputChannel,
    );
    this.activeEditor = editor;
    await editor.initialize();
  }

  previewDiff(): void {
    if (this.activeEditor) {
      this.activeEditor.showDiff();
    }
  }
}

class FormEditorInstance {
  private model: FormModel | null = null;
  private commandEngine: ICommandEngine;
  private layoutEngine: ILayoutEngine;
  private currentLayout: LayoutResult | null = null;
  private isDirty = false;
  private disposed = false;
  private originalXml: string;
  private viewport: Size = { width: 800, height: 600 };
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {
    const config = vscode.workspace.getConfiguration('formDesigner');
    const maxUndo = config.get<number>('maxUndo', DEFAULT_CONFIG.maxUndo);

    this.commandEngine = new CommandEngine(maxUndo);
    this.layoutEngine = createLayoutEngine();
    this.originalXml = document.getText();

    this.setupWebview();
    this.setupFileWatcher();
  }

  async initialize(): Promise<void> {
    const xml = this.document.getText();
    this.output.appendLine(`Parsing form: ${this.document.uri.fsPath}`);

    const { model, diagnostics } = parseXmlToModel(xml, this.document.uri.toString());
    this.model = model;

    if (diagnostics.length > 0) {
      this.output.appendLine(`Parse diagnostics: ${diagnostics.length}`);
      for (const d of diagnostics) {
        this.output.appendLine(`  [${d.severity}] ${d.message}`);
      }
    }

    // Compute layout
    this.currentLayout = this.layoutEngine.computeLayout(model.form, this.viewport);
    this.output.appendLine(`Layout computed in ${this.currentLayout.computeTimeMs.toFixed(1)}ms, ${this.currentLayout.boxes.size} boxes`);
  }

  private setupWebview(): void {
    const webview = this.panel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webview.html = this.getWebviewContent();

    // Handle messages from WebView
    this.disposables.push(
      webview.onDidReceiveMessage((msg: UIToExtMessage) => this.handleMessage(msg)),
    );

    // Handle panel dispose
    this.panel.onDidDispose(() => {
      this.disposed = true;
      for (const d of this.disposables) d.dispose();
    });
  }

  private setupFileWatcher(): void {
    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== this.document.uri.toString()) return;
      if (this.disposed) return;

      // External change detection
      const newText = e.document.getText();
      if (newText !== this.originalXml && !this.isDirty) {
        this.handleExternalChange();
      }
    });
    this.disposables.push(watcher);
  }

  private async handleMessage(msg: UIToExtMessage): Promise<void> {
    if (!this.model) return;

    switch (msg.type) {
      case 'ui:ready':
        this.sendInitModel();
        break;

      case 'cmd:applyPatch':
        this.handleApplyPatch(msg.patch, msg.patchId, msg.undoLabel);
        break;

      case 'cmd:requestUndo':
        this.handleUndo();
        break;

      case 'cmd:requestRedo':
        this.handleRedo();
        break;

      case 'cmd:requestSave':
        await this.handleSave();
        break;

      case 'cmd:requestPreviewDiff':
        this.showDiff();
        break;

      case 'ui:viewportResize':
        this.viewport = msg.viewport;
        if (this.model) {
          this.currentLayout = this.layoutEngine.computeLayout(this.model.form, this.viewport);
        }
        break;

      case 'ui:stateSnapshot':
        this.saveUIState(msg.uiState);
        break;

      case 'ui:selectNode':
        // Selection tracking — no action needed on extension side for MVP
        break;

      case 'ui:openHandler':
        this.openBslHandler(msg.handlerName);
        break;

      case 'ui:error':
        this.output.appendLine(`[WebView Error] ${msg.error}`);
        if (msg.stack) this.output.appendLine(msg.stack);
        break;
    }
  }

  private sendInitModel(): void {
    if (!this.model || !this.currentLayout) return;

    const layout = serializeLayoutResult(this.currentLayout);
    const diagnostics = validateModel(this.model).map((d) => ({
      severity: d.severity,
      message: d.message,
      nodeInternalId: d.nodeInternalId,
      path: d.path,
    }));

    this.postMessage({
      type: 'init:model',
      model: this.model,
      layout,
      diagnostics,
    });

    // Restore UI state
    const savedState = this.context.workspaceState.get<UIState>(
      `uiState:${this.document.uri.toString()}`,
    );
    if (savedState) {
      this.postMessage({ type: 'state:restore', uiState: savedState });
    }
  }

  private handleApplyPatch(patch: FormPatch, patchId: string, label?: string): void {
    if (!this.model) return;

    try {
      const result = this.commandEngine.apply(this.model, patch, label);
      this.model = result.model;

      // Recompute layout
      this.currentLayout = this.layoutEngine.computeLayout(this.model.form, this.viewport);

      this.isDirty = true;
      this.postMessage({ type: 'state:dirty', dirty: true });

      this.postMessage({
        type: 'patch:ack',
        patchId,
        diagnostics: result.diagnostics.map((d) => ({
          severity: d.severity,
          message: d.message,
          nodeInternalId: d.nodeInternalId,
          path: d.path,
        })),
        layoutDelta: {
          updated: Object.fromEntries(this.currentLayout.boxes),
          removed: [],
        },
      });
    } catch (err) {
      this.output.appendLine(`Patch error: ${err}`);
      this.postMessage({
        type: 'patch:reject',
        patchId,
        reason: String(err),
        model: this.model,
        layout: serializeLayoutResult(this.currentLayout!),
      });
    }
  }

  private handleUndo(): void {
    if (!this.model) return;
    const result = this.commandEngine.undo(this.model);
    if (!result) return;

    this.model = result.model;
    this.currentLayout = this.layoutEngine.computeLayout(this.model.form, this.viewport);
    this.sendFullModelUpdate();
  }

  private handleRedo(): void {
    if (!this.model) return;
    const result = this.commandEngine.redo(this.model);
    if (!result) return;

    this.model = result.model;
    this.currentLayout = this.layoutEngine.computeLayout(this.model.form, this.viewport);
    this.sendFullModelUpdate();
  }

  private async handleSave(): Promise<void> {
    if (!this.model) return;

    const xml = serializeModelToXml(this.model);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      this.document.uri,
      new vscode.Range(0, 0, this.document.lineCount, 0),
      xml,
    );
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      await this.document.save();
      this.originalXml = xml;
      this.isDirty = false;
      this.postMessage({ type: 'state:dirty', dirty: false });
      this.output.appendLine('Form saved successfully');
    }
  }

  showDiff(): void {
    if (!this.model) return;
    const currentXml = serializeModelToXml(this.model);
    // Open diff in VS Code
    const originalUri = this.document.uri;
    const modifiedUri = vscode.Uri.parse(`untitled:${this.document.uri.fsPath}.modified.xml`);

    vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      'Form XML Diff',
    );
  }

  private handleExternalChange(): void {
    if (this.isDirty) {
      this.postMessage({ type: 'file:externalChange', action: 'conflict' });
    } else {
      // Auto-reload
      const xml = this.document.getText();
      const { model, diagnostics } = parseXmlToModel(xml, this.document.uri.toString());
      this.model = model;
      this.currentLayout = this.layoutEngine.computeLayout(model.form, this.viewport);
      this.sendFullModelUpdate();
    }
  }

  private sendFullModelUpdate(): void {
    if (!this.model || !this.currentLayout) return;
    this.postMessage({
      type: 'model:reload',
      model: this.model,
      layout: serializeLayoutResult(this.currentLayout),
      diagnostics: validateModel(this.model).map((d) => ({
        severity: d.severity,
        message: d.message,
        nodeInternalId: d.nodeInternalId,
        path: d.path,
      })),
    });
  }

  private saveUIState(uiState: UIState): void {
    this.context.workspaceState.update(
      `uiState:${this.document.uri.toString()}`,
      uiState,
    );
  }

  private openBslHandler(handlerName: string): void {
    // Try to find Module.bsl alongside the form
    const formPath = this.document.uri.fsPath;
    const modulePath = formPath.replace(/Form\.xml$/, 'Form/Module.bsl');
    const moduleUri = vscode.Uri.file(modulePath);

    vscode.workspace.openTextDocument(moduleUri).then(
      (doc) => {
        const text = doc.getText();
        const regex = new RegExp(`Процедура\\s+${handlerName}|Функция\\s+${handlerName}|Procedure\\s+${handlerName}|Function\\s+${handlerName}`, 'i');
        const match = text.match(regex);
        if (match && match.index !== undefined) {
          const pos = doc.positionAt(match.index);
          vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(pos, pos),
          });
        } else {
          vscode.window.showTextDocument(doc);
        }
      },
      () => {
        vscode.window.showWarningMessage(`Module.bsl not found at ${modulePath}`);
      },
    );
  }

  private postMessage(message: ExtToUIMessage): void {
    if (!this.disposed) {
      this.panel.webview.postMessage(message);
    }
  }

  private getWebviewContent(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' vscode-resource:; font-src vscode-resource:;">
  <title>1C Form Designer</title>
  <style>
    :root {
      --designer-bg: var(--vscode-editor-background);
      --designer-fg: var(--vscode-editor-foreground);
      --designer-border: var(--vscode-panel-border);
      --designer-header-bg: var(--vscode-sideBarSectionHeader-background);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--designer-bg);
      color: var(--designer-fg);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      overflow: hidden;
      height: 100vh;
    }
    #root { height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Bridge: WebView ↔ Extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      window.dispatchEvent(new CustomEvent('ext-message', { detail: message }));
    });

    window.postToExtension = (message) => {
      vscode.postMessage(message);
    };

    // Signal ready
    window.postToExtension({ type: 'ui:ready' });
  </script>
</body>
</html>`;
  }
}

// ─── Helpers ───

function serializeLayoutResult(result: LayoutResult): SerializedLayoutResult {
  const boxes: Record<string, import('@1c-form-designer/core-form').LayoutBox> = {};
  for (const [id, box] of result.boxes) {
    boxes[id] = box;
  }
  return { boxes, contentSize: result.contentSize };
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
