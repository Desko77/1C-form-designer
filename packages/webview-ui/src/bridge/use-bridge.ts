/**
 * Bridge hook: handles communication between WebView and Extension.
 */

import { useEffect } from 'react';
import { useDesignerStore } from '../store/designer-store';
import type { ExtToUIMessage } from '@1c-form-designer/shared';

declare global {
  interface Window {
    postToExtension?: (message: unknown) => void;
  }
}

export function postToExtension(message: unknown): void {
  window.postToExtension?.(message);
}

export function useBridge(): void {
  const setModel = useDesignerStore((s) => s.setModel);
  const setDirty = useDesignerStore((s) => s.setDirty);
  const setDiagnostics = useDesignerStore((s) => s.setDiagnostics);
  const setConfig = useDesignerStore((s) => s.setConfig);
  const setExpandedNodeIds = useDesignerStore((s) => s.setExpandedNodeIds);
  const selectNode = useDesignerStore((s) => s.selectNode);
  const setActiveView = useDesignerStore((s) => s.setActiveView);
  const updateLayout = useDesignerStore((s) => s.updateLayout);

  useEffect(() => {
    const handler = (event: Event) => {
      const msg = (event as CustomEvent<ExtToUIMessage>).detail;
      if (!msg) return;

      switch (msg.type) {
        case 'init:model':
          setModel(msg.model, msg.layout, msg.diagnostics);
          break;

        case 'model:reload':
          setModel(msg.model, msg.layout, msg.diagnostics);
          break;

        case 'patch:ack':
          setDiagnostics(msg.diagnostics);
          if (msg.layoutDelta) {
            // Apply delta to current layout
            const store = useDesignerStore.getState();
            const newBoxes = { ...store.layout, ...msg.layoutDelta.updated };
            for (const id of msg.layoutDelta.removed) {
              delete newBoxes[id];
            }
            updateLayout({ boxes: newBoxes, contentSize: store.contentSize });
          }
          break;

        case 'patch:reject':
          setModel(msg.model, msg.layout, []);
          break;

        case 'diag:list':
          setDiagnostics(msg.diagnostics);
          break;

        case 'config:update':
          setConfig(msg.config);
          break;

        case 'state:dirty':
          setDirty(msg.dirty);
          break;

        case 'state:restore':
          if (msg.uiState.selectedNodeId) selectNode(msg.uiState.selectedNodeId);
          if (msg.uiState.expandedNodeIds) setExpandedNodeIds(msg.uiState.expandedNodeIds);
          if (msg.uiState.activeView) setActiveView(msg.uiState.activeView);
          break;

        case 'theme:changed':
          // Theme is handled by VS Code CSS variables
          break;

        case 'file:externalChange':
          if (msg.action === 'conflict') {
            // Show conflict notification in UI
            console.warn('External file change detected while dirty');
          }
          break;
      }
    };

    window.addEventListener('ext-message', handler);
    return () => window.removeEventListener('ext-message', handler);
  }, [setModel, setDirty, setDiagnostics, setConfig, setExpandedNodeIds, selectNode, setActiveView, updateLayout]);
}
