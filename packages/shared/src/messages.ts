/**
 * Typed message protocol between Extension Host and WebView UI.
 */

import type {
  FormModel,
  FormPatch,
  Size,
} from '@1c-form-designer/core-form';
import type { LayoutBox } from './layout-types';

// ─── Extension → UI Messages ───

export type ExtToUIMessage =
  | { type: 'init:model'; model: FormModel; layout: SerializedLayoutResult; diagnostics: Diagnostic[] }
  | { type: 'patch:ack'; patchId: string; diagnostics: Diagnostic[]; layoutDelta?: LayoutDelta }
  | { type: 'patch:reject'; patchId: string; reason: string; model: FormModel; layout: SerializedLayoutResult }
  | { type: 'model:reload'; model: FormModel; layout: SerializedLayoutResult; diagnostics: Diagnostic[] }
  | { type: 'diag:list'; diagnostics: Diagnostic[] }
  | { type: 'config:update'; config: DesignerConfig }
  | { type: 'state:dirty'; dirty: boolean }
  | { type: 'state:restore'; uiState: UIState }
  | { type: 'theme:changed'; kind: 'light' | 'dark' | 'high-contrast' }
  | { type: 'file:externalChange'; action: 'reload' | 'conflict' };

// ─── UI → Extension Messages ───

export type UIToExtMessage =
  | { type: 'cmd:applyPatch'; patch: FormPatch; patchId: string; undoLabel?: string }
  | { type: 'cmd:requestSave' }
  | { type: 'cmd:requestPreviewDiff' }
  | { type: 'cmd:requestUndo' }
  | { type: 'cmd:requestRedo' }
  | { type: 'ui:ready' }
  | { type: 'ui:selectNode'; nodeInternalId: string }
  | { type: 'ui:openHandler'; handlerName: string }
  | { type: 'ui:viewportResize'; viewport: Size }
  | { type: 'ui:stateSnapshot'; uiState: UIState }
  | { type: 'ui:error'; error: string; stack?: string };

// ─── Supporting Types ───

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeInternalId?: string;
  path?: string;
}

export interface UIState {
  selectedNodeId?: string;
  expandedNodeIds: string[];
  scrollPosition: { tree: number; canvas: number };
  activeView: 'design' | 'structure' | 'source';
  panelWidths: { tree: number; inspector: number };
}

export interface SerializedLayoutResult {
  boxes: Record<string /* internalId */, LayoutBox>;
  contentSize: Size;
}

export interface LayoutDelta {
  updated: Record<string, LayoutBox>;
  removed: string[];
}

export interface DesignerConfig {
  formattingMode: 'preserve' | 'canonical';
  maxUndo: number;
  defaultView: 'design' | 'structure' | 'source';
}
