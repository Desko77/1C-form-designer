import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesignerStore } from '../../store/designer-store';
import { postToExtension } from '../../bridge/use-bridge';
import type { FormNode } from '@1c-form-designer/core-form';
import type { UIToExtMessage } from '@1c-form-designer/shared';

/* ------------------------------------------------------------------ */
/*  Icon mapping by node kind                                          */
/* ------------------------------------------------------------------ */

const KIND_ICONS: Record<string, string> = {
  usualGroup: '\u25A4',    // square with horizontal lines
  pages: '\u2750',         // upper right drop-shadowed box
  page: '\u25A1',          // white square
  columnGroup: '\u25A5',   // columns
  commandBar: '\u2630',    // trigram / menu
  autoCommandBar: '\u2630',
  field: '\u270F',         // pencil
  decoration: '\u2606',    // star outline
  button: '\u25C9',        // circle target
  table: '\u2637',         // trigram for earth
  unknown: '\u2753',       // question mark
};

function iconForKind(kind: string): string {
  return KIND_ICONS[kind] ?? '\u25A0';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hasChildren(node: FormNode): node is FormNode & { children: FormNode[] } {
  return 'children' in node && Array.isArray((node as unknown as Record<string, unknown>).children);
}

function matchesSearch(node: FormNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    node.name.toLowerCase().includes(q) ||
    node.kind.toLowerCase().includes(q) ||
    (node.caption?.value ?? '').toLowerCase().includes(q)
  );
}

/** Returns true if node or any descendant matches the search query */
function nodeOrDescendantMatches(node: FormNode, query: string): boolean {
  if (matchesSearch(node, query)) return true;
  if (hasChildren(node)) {
    return node.children.some((child) => nodeOrDescendantMatches(child, query));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Context Menu                                                       */
/* ------------------------------------------------------------------ */

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

interface ContextMenuAction {
  label: string;
  action: string;
  shortcut?: string;
  separator?: boolean;
}

const CONTEXT_MENU_ACTIONS: ContextMenuAction[] = [
  { label: 'Add child element', action: 'add' },
  { label: 'Duplicate', action: 'duplicate', shortcut: 'Ctrl+D' },
  { label: 'Rename', action: 'rename', shortcut: 'F2', separator: true },
  { label: 'Delete', action: 'delete', shortcut: 'Del' },
];

/* ------------------------------------------------------------------ */
/*  TreeNodeRow                                                        */
/* ------------------------------------------------------------------ */

interface TreeNodeRowProps {
  node: FormNode;
  depth: number;
  searchQuery: string;
}

const TreeNodeRow: React.FC<TreeNodeRowProps> = React.memo(
  ({ node, depth, searchQuery }) => {
    const selectedNodeId = useDesignerStore((s) => s.selectedNodeId);
    const expandedNodeIds = useDesignerStore((s) => s.expandedNodeIds);
    const selectNode = useDesignerStore((s) => s.selectNode);
    const toggleExpanded = useDesignerStore((s) => s.toggleExpanded);

    const nodeId = node.id.internalId;
    const isSelected = selectedNodeId === nodeId;
    const isExpanded = expandedNodeIds.has(nodeId);
    const childNodes = hasChildren(node) ? node.children : [];
    const hasChildNodes = childNodes.length > 0;

    // When searching, force expand nodes with matching descendants
    const forceExpanded =
      searchQuery !== '' && childNodes.some((c) => nodeOrDescendantMatches(c, searchQuery));

    const effectiveExpanded = isExpanded || forceExpanded;

    // Filter out nodes that don't match when searching
    if (searchQuery && !nodeOrDescendantMatches(node, searchQuery)) {
      return null;
    }

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(nodeId);
      const msg: UIToExtMessage = { type: 'ui:selectNode', nodeInternalId: nodeId };
      postToExtension(msg);
    };

    const handleChevronClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpanded(nodeId);
    };

    const handleDragStart = (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', nodeId);
      e.dataTransfer.effectAllowed = 'move';
    };

    const displayLabel = node.caption?.value || node.name;

    return (
      <>
        <div
          className={`tree-node ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={handleClick}
          draggable
          onDragStart={handleDragStart}
          data-node-id={nodeId}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildNodes ? effectiveExpanded : undefined}
          aria-level={depth + 1}
        >
          {/* Drag handle */}
          <span className="tree-node-drag-handle" title="Drag to reorder">
            &#x2801;&#x2801;
          </span>

          {/* Chevron */}
          <span
            className={`tree-node-chevron ${
              hasChildNodes
                ? effectiveExpanded
                  ? 'expanded'
                  : ''
                : 'leaf'
            }`}
            onClick={hasChildNodes ? handleChevronClick : undefined}
            aria-hidden="true"
          >
            {hasChildNodes ? '\u25B6' : ''}
          </span>

          {/* Icon */}
          <span className="tree-node-icon" aria-hidden="true">
            {iconForKind(node.kind)}
          </span>

          {/* Label */}
          <span className="tree-node-name" title={`${node.kind}: ${node.name}`}>
            {displayLabel}
          </span>
        </div>

        {/* Recursively render children */}
        {hasChildNodes && effectiveExpanded && (
          <div role="group">
            {childNodes.map((child) => (
              <TreeNodeRow
                key={child.id.internalId}
                node={child}
                depth={depth + 1}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </>
    );
  },
);

TreeNodeRow.displayName = 'TreeNodeRow';

/* ------------------------------------------------------------------ */
/*  TreePanel                                                          */
/* ------------------------------------------------------------------ */

export const TreePanel: React.FC = () => {
  const model = useDesignerStore((s) => s.model);
  const searchQuery = useDesignerStore((s) => s.searchQuery);
  const selectNode = useDesignerStore((s) => s.selectNode);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const children = model?.form.children ?? [];

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-node-id]');
      if (!row) return;
      const nodeId = row.dataset.nodeId;
      if (!nodeId) return;

      selectNode(nodeId);
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    [selectNode],
  );

  // Dispatch a context menu action
  const handleContextAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;
      const { nodeId } = contextMenu;

      switch (action) {
        case 'add': {
          const msg: UIToExtMessage = {
            type: 'cmd:applyPatch',
            patch: {
              op: 'addNode',
              parentId: nodeId,
              node: {
                kind: 'usualGroup',
                id: { xmlId: '', internalId: crypto.randomUUID() },
                name: 'NewGroup',
                children: [],
              },
            },
            patchId: crypto.randomUUID(),
            undoLabel: 'Add element',
          };
          postToExtension(msg);
          break;
        }
        case 'delete': {
          const msg: UIToExtMessage = {
            type: 'cmd:applyPatch',
            patch: { op: 'removeNode', nodeId },
            patchId: crypto.randomUUID(),
            undoLabel: 'Delete element',
          };
          postToExtension(msg);
          break;
        }
        case 'duplicate': {
          const msg: UIToExtMessage = {
            type: 'cmd:applyPatch',
            patch: {
              op: 'addNode',
              parentId: '',
              node: null as unknown as FormNode,
            },
            patchId: crypto.randomUUID(),
            undoLabel: 'Duplicate element',
          };
          postToExtension(msg);
          break;
        }
        case 'rename': {
          const newName = prompt('New name:');
          if (newName) {
            const msg: UIToExtMessage = {
              type: 'cmd:applyPatch',
              patch: { op: 'setProp', nodeId, propPath: 'name', value: newName },
              patchId: crypto.randomUUID(),
              undoLabel: 'Rename element',
            };
            postToExtension(msg);
          }
          break;
        }
      }

      setContextMenu(null);
    },
    [contextMenu],
  );

  // Close context menu on outside click or Escape
  const handlePanelClick = useCallback(() => {
    if (contextMenu) setContextMenu(null);
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu]);

  // Close context menu on scroll
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !contextMenu) return;
    const handleScroll = () => setContextMenu(null);
    panel.addEventListener('scroll', handleScroll);
    return () => panel.removeEventListener('scroll', handleScroll);
  }, [contextMenu]);

  if (!model) {
    return (
      <div className="tree-panel tree-panel--empty">
        <span>No form loaded</span>
      </div>
    );
  }

  return (
    <div
      className="tree-panel"
      ref={panelRef}
      onContextMenu={handleContextMenu}
      onClick={handlePanelClick}
      role="tree"
      aria-label="Form element tree"
    >
      <div className="tree-panel-header">
        <span className="tree-panel-title">Elements</span>
      </div>

      <div className="tree-panel-content">
        {children.length === 0 ? (
          <div className="tree-panel-empty">
            <span>No elements</span>
          </div>
        ) : (
          children.map((child) => (
            <TreeNodeRow
              key={child.id.internalId}
              node={child}
              depth={0}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            position: 'fixed',
          }}
          role="menu"
        >
          {CONTEXT_MENU_ACTIONS.map((item, i) => (
            <React.Fragment key={item.action}>
              {item.separator && i > 0 && <div className="context-menu-separator" />}
              <div
                className="context-menu-item"
                onClick={() => handleContextAction(item.action)}
                role="menuitem"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span style={{ marginLeft: 'auto', opacity: 0.6, paddingLeft: 16 }}>
                    {item.shortcut}
                  </span>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
