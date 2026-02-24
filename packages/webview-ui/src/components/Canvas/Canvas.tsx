import React, { useCallback, useMemo } from 'react';
import { useDesignerStore } from '../../store/designer-store';
import { postToExtension } from '../../bridge/use-bridge';
import type { FormNode, TableNode, FieldNode, FieldTypeTier3 } from '@1c-form-designer/core-form';
import type { LayoutBox, UIToExtMessage } from '@1c-form-designer/shared';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIER3_FIELD_TYPES: Set<string> = new Set<FieldTypeTier3>([
  'trackBar',
  'progressBar',
  'htmlField',
  'calendarField',
  'chartField',
  'formattedDocField',
  'plannerField',
  'periodField',
  'textDocField',
  'spreadsheetDocField',
  'graphicalSchemaField',
  'geoSchemaField',
  'dendrogramField',
]);

const DIRECTION_ARROWS: Record<string, string> = {
  vertical: '\u2195',    // up-down arrow
  horizontal: '\u2194',  // left-right arrow
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hasChildren(node: FormNode): node is FormNode & { children: FormNode[] } {
  return 'children' in node && Array.isArray((node as unknown as Record<string, unknown>).children);
}

/** Build a flat index of nodes from form children for fast ID lookup */
function buildNodeMap(children: FormNode[]): Map<string, FormNode> {
  const map = new Map<string, FormNode>();

  function walk(nodes: FormNode[]): void {
    for (const node of nodes) {
      map.set(node.id.internalId, node);
      if (hasChildren(node)) {
        walk(node.children);
      }
      // Table command bars
      if (node.kind === 'table' && (node as TableNode).commandBar) {
        const cmdBar = (node as TableNode).commandBar!;
        map.set(cmdBar.id.internalId, cmdBar);
        if (hasChildren(cmdBar)) {
          walk(cmdBar.children);
        }
      }
    }
  }

  walk(children);
  return map;
}

/* ------------------------------------------------------------------ */
/*  CanvasElement                                                      */
/* ------------------------------------------------------------------ */

interface CanvasElementProps {
  nodeId: string;
  node: FormNode | undefined;
  box: LayoutBox;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
}

const CanvasElement: React.FC<CanvasElementProps> = React.memo(
  ({ nodeId, node, box, isSelected, onSelect }) => {
    if (!box.visible) return null;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(nodeId);
    };

    const kind = node?.kind ?? 'unknown';
    const name = node?.name ?? nodeId;
    const caption = node?.caption?.value ?? '';
    const displayLabel = caption || name;

    // Determine element type class and render content
    const renderContent = (): React.ReactNode => {
      switch (kind) {
        case 'usualGroup':
        case 'pages':
        case 'page':
        case 'columnGroup': {
          const direction = box.direction;
          const groupNode = node as FormNode & { group?: string };
          const groupDir = groupNode?.layout?.horizontalStretch ? 'horizontal' : direction;
          return (
            <div className="canvas-element-header">
              <span>{displayLabel}</span>
              {groupDir && (
                <span title={`Direction: ${groupDir}`}>
                  {DIRECTION_ARROWS[groupDir] ?? ''}
                </span>
              )}
            </div>
          );
        }

        case 'commandBar':
        case 'autoCommandBar':
          return (
            <div className="canvas-element-header">
              <span>{displayLabel}</span>
              <span title="Command bar">{'\u2630'}</span>
            </div>
          );

        case 'field': {
          const fieldNode = node as FieldNode | undefined;
          const fieldType = fieldNode?.fieldType ?? 'input';
          const isT3 = TIER3_FIELD_TYPES.has(fieldType);

          if (isT3) {
            return (
              <div className="canvas-field">
                <span className="field-label">{displayLabel}</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>[{fieldType}]</span>
              </div>
            );
          }

          return (
            <div className="canvas-field">
              <span className="field-label">{displayLabel}</span>
              {fieldType === 'checkbox' ? (
                <input type="checkbox" disabled className="field-input" />
              ) : (
                <div className="field-input" />
              )}
            </div>
          );
        }

        case 'decoration':
          return (
            <div className="canvas-element-header">
              <span>{displayLabel}</span>
            </div>
          );

        case 'button':
          return (
            <div className="canvas-element-header">
              <span>{displayLabel}</span>
            </div>
          );

        case 'table': {
          const tableNode = node as TableNode | undefined;
          const columns = tableNode?.columns ?? [];
          return (
            <div style={{ overflow: 'hidden', width: '100%', height: '100%' }}>
              <div className="canvas-element-header">
                <span>{displayLabel}</span>
              </div>
              {columns.length > 0 && (
                <table className="canvas-table">
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col.id.internalId}>
                          {col.caption?.value || col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {columns.map((col) => (
                        <td key={col.id.internalId}>&nbsp;</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          );
        }

        case 'unknown':
        default:
          return (
            <div className="canvas-element-header">
              <span>{displayLabel}</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>[{kind}]</span>
            </div>
          );
      }
    };

    // Determine CSS classes based on kind
    const classNames = ['canvas-element'];
    if (isSelected) classNames.push('selected');

    switch (kind) {
      case 'usualGroup':
      case 'pages':
      case 'page':
      case 'columnGroup':
      case 'commandBar':
      case 'autoCommandBar':
        classNames.push('canvas-group');
        break;
      case 'unknown':
        classNames.push('canvas-unknown');
        break;
    }

    // Check for tier3 field
    if (kind === 'field') {
      const fieldNode = node as FieldNode | undefined;
      if (fieldNode && TIER3_FIELD_TYPES.has(fieldNode.fieldType)) {
        classNames.push('canvas-unknown');
      }
    }

    return (
      <div
        className={classNames.join(' ')}
        style={{
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
        }}
        onClick={handleClick}
        data-node-id={nodeId}
        title={`${kind}: ${name}`}
      >
        {renderContent()}
      </div>
    );
  },
);

CanvasElement.displayName = 'CanvasElement';

/* ------------------------------------------------------------------ */
/*  Canvas                                                             */
/* ------------------------------------------------------------------ */

export const Canvas: React.FC = () => {
  const model = useDesignerStore((s) => s.model);
  const layout = useDesignerStore((s) => s.layout);
  const contentSize = useDesignerStore((s) => s.contentSize);
  const selectedNodeId = useDesignerStore((s) => s.selectedNodeId);
  const selectNode = useDesignerStore((s) => s.selectNode);

  // Build a lookup map of all form nodes by internalId
  const nodeMap = useMemo(() => {
    if (!model) return new Map<string, FormNode>();
    return buildNodeMap(model.form.children);
  }, [model]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      const msg: UIToExtMessage = { type: 'ui:selectNode', nodeInternalId: nodeId };
      postToExtension(msg);
    },
    [selectNode],
  );

  // Click on empty canvas area deselects
  const handleCanvasClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Sorted entries: groups first (lower z-index), then leaves
  const sortedEntries = useMemo(() => {
    const entries = Object.entries(layout);
    // Render groups first so they appear behind children
    return entries.sort(([idA], [idB]) => {
      const nodeA = nodeMap.get(idA);
      const nodeB = nodeMap.get(idB);
      const isGroupA = nodeA && hasChildren(nodeA) ? 0 : 1;
      const isGroupB = nodeB && hasChildren(nodeB) ? 0 : 1;
      return isGroupA - isGroupB;
    });
  }, [layout, nodeMap]);

  if (!model) {
    return (
      <div className="canvas-container">
        <span style={{ padding: 16, opacity: 0.6 }}>No form loaded</span>
      </div>
    );
  }

  return (
    <div className="canvas-container" onClick={handleCanvasClick}>
      <div
        className="canvas-surface"
        style={{
          position: 'relative',
          width: contentSize.width || '100%',
          height: contentSize.height || '100%',
          minWidth: '100%',
          minHeight: '100%',
        }}
      >
        {sortedEntries.map(([nodeId, box]) => (
          <CanvasElement
            key={nodeId}
            nodeId={nodeId}
            node={nodeMap.get(nodeId)}
            box={box}
            isSelected={selectedNodeId === nodeId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
};
