/**
 * Zustand store — central state management for the WebView UI.
 */

import { create } from 'zustand';
import type {
  FormModel,
  FormNode,
} from '@1c-form-designer/core-form';
import type {
  LayoutBox,
  Size,
  Diagnostic,
  UIState,
  SerializedLayoutResult,
  DesignerConfig,
} from '@1c-form-designer/shared';

export interface DesignerState {
  // Model
  model: FormModel | null;
  layout: Record<string, LayoutBox>;
  contentSize: Size;
  diagnostics: Diagnostic[];

  // UI state
  selectedNodeId: string | null;
  expandedNodeIds: Set<string>;
  activeView: 'design' | 'structure' | 'source';
  isDirty: boolean;
  searchQuery: string;

  // Panel widths
  treePanelWidth: number;
  inspectorPanelWidth: number;

  // Config
  config: DesignerConfig;

  // Actions
  setModel: (model: FormModel, layout: SerializedLayoutResult, diagnostics: Diagnostic[]) => void;
  updateLayout: (layout: SerializedLayoutResult) => void;
  selectNode: (nodeId: string | null) => void;
  toggleExpanded: (nodeId: string) => void;
  setExpandedNodeIds: (ids: string[]) => void;
  setActiveView: (view: 'design' | 'structure' | 'source') => void;
  setDirty: (dirty: boolean) => void;
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  setSearchQuery: (query: string) => void;
  setConfig: (config: DesignerConfig) => void;
  setTreePanelWidth: (width: number) => void;
  setInspectorPanelWidth: (width: number) => void;

  // Get UI state snapshot for persistence
  getUIState: () => UIState;
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  // Initial state
  model: null,
  layout: {},
  contentSize: { width: 0, height: 0 },
  diagnostics: [],
  selectedNodeId: null,
  expandedNodeIds: new Set<string>(),
  activeView: 'design',
  isDirty: false,
  searchQuery: '',
  treePanelWidth: 250,
  inspectorPanelWidth: 300,
  config: {
    formattingMode: 'preserve',
    maxUndo: 200,
    defaultView: 'design',
  },

  // Actions
  setModel: (model, layout, diagnostics) =>
    set({
      model,
      layout: layout.boxes,
      contentSize: layout.contentSize,
      diagnostics,
    }),

  updateLayout: (layout) =>
    set({
      layout: layout.boxes,
      contentSize: layout.contentSize,
    }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  toggleExpanded: (nodeId) =>
    set((state) => {
      const newSet = new Set(state.expandedNodeIds);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return { expandedNodeIds: newSet };
    }),

  setExpandedNodeIds: (ids) => set({ expandedNodeIds: new Set(ids) }),

  setActiveView: (view) => set({ activeView: view }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  setDiagnostics: (diagnostics) => set({ diagnostics }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setConfig: (config) => set({ config }),

  setTreePanelWidth: (width) => set({ treePanelWidth: width }),

  setInspectorPanelWidth: (width) => set({ inspectorPanelWidth: width }),

  getUIState: () => {
    const state = get();
    return {
      selectedNodeId: state.selectedNodeId ?? undefined,
      expandedNodeIds: Array.from(state.expandedNodeIds),
      scrollPosition: { tree: 0, canvas: 0 },
      activeView: state.activeView,
      panelWidths: {
        tree: state.treePanelWidth,
        inspector: state.inspectorPanelWidth,
      },
    };
  },
}));
