import React, { useCallback, useMemo, useState } from 'react';
import { useDesignerStore } from '../../store/designer-store';
import { postToExtension } from '../../bridge/use-bridge';
import type {
  FormNode,
  FormModel,
  EventBinding,
  FieldNode,
  UsualGroupNode,
  TableNode,
  ButtonNode,
  DecorationNode,
  GroupType,
  LayoutProps,
  StyleProps,
} from '@1c-form-designer/core-form';
import type { UIToExtMessage } from '@1c-form-designer/shared';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findNodeById(model: FormModel, nodeId: string): FormNode | null {
  function search(nodes: FormNode[]): FormNode | null {
    for (const node of nodes) {
      if (node.id.internalId === nodeId) return node;
      if ('children' in node && Array.isArray((node as unknown as Record<string, unknown>).children)) {
        const found = search((node as { children: FormNode[] }).children);
        if (found) return found;
      }
      if (node.kind === 'table' && (node as TableNode).commandBar) {
        const cmdBar = (node as TableNode).commandBar!;
        if (cmdBar.id.internalId === nodeId) return cmdBar;
        const found = search(cmdBar.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(model.form.children);
}

type PropType = 'text' | 'number' | 'checkbox' | 'select';

interface PropDef {
  key: string;
  label: string;
  propPath: string;
  type: PropType;
  options?: { value: string; label: string }[];
  readOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Property group definitions                                         */
/* ------------------------------------------------------------------ */

const GROUP_TYPE_OPTIONS = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'horizontalIfPossible', label: 'Horizontal if possible' },
  { value: 'alwaysHorizontal', label: 'Always horizontal' },
  { value: 'columnsLikeInList', label: 'Columns like in list' },
  { value: 'indentedColumnsLikeInList', label: 'Indented columns' },
];

const TITLE_LOCATION_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'None' },
];

function getBasicProps(node: FormNode): PropDef[] {
  const props: PropDef[] = [
    { key: 'name', label: 'Name', propPath: 'name', type: 'text' },
    { key: 'caption', label: 'Caption', propPath: 'caption.value', type: 'text' },
  ];

  switch (node.kind) {
    case 'usualGroup':
      props.push({
        key: 'group',
        label: 'Group type',
        propPath: 'group',
        type: 'select',
        options: GROUP_TYPE_OPTIONS,
      });
      props.push({ key: 'showTitle', label: 'Show title', propPath: 'showTitle', type: 'checkbox' });
      props.push({ key: 'collapsible', label: 'Collapsible', propPath: 'collapsible', type: 'checkbox' });
      break;
    case 'field':
      props.push({
        key: 'fieldType',
        label: 'Field type',
        propPath: 'fieldType',
        type: 'text',
        readOnly: true,
      });
      props.push({ key: 'dataPath', label: 'Data path', propPath: 'dataPath', type: 'text' });
      props.push({ key: 'multiLine', label: 'Multi-line', propPath: 'multiLine', type: 'checkbox' });
      break;
    case 'button':
      props.push({ key: 'commandName', label: 'Command', propPath: 'commandName', type: 'text' });
      props.push({ key: 'defaultButton', label: 'Default', propPath: 'defaultButton', type: 'checkbox' });
      break;
    case 'table':
      props.push({ key: 'dataPath', label: 'Data path', propPath: 'dataPath', type: 'text' });
      props.push({ key: 'rowCount', label: 'Row count', propPath: 'rowCount', type: 'number' });
      props.push({ key: 'header', label: 'Header', propPath: 'header', type: 'checkbox' });
      props.push({ key: 'footer', label: 'Footer', propPath: 'footer', type: 'checkbox' });
      break;
    case 'decoration':
      props.push({
        key: 'decorationType',
        label: 'Type',
        propPath: 'decorationType',
        type: 'select',
        options: [
          { value: 'label', label: 'Label' },
          { value: 'picture', label: 'Picture' },
        ],
      });
      break;
  }

  return props;
}

function getVisibilityProps(_node: FormNode): PropDef[] {
  return [
    { key: 'visible', label: 'Visible', propPath: 'visible', type: 'checkbox' },
    { key: 'enabled', label: 'Enabled', propPath: 'enabled', type: 'checkbox' },
    { key: 'readOnly', label: 'Read only', propPath: 'readOnly', type: 'checkbox' },
    { key: 'skipOnInput', label: 'Skip on input', propPath: 'skipOnInput', type: 'checkbox' },
  ];
}

function getDataProps(node: FormNode): PropDef[] {
  const props: PropDef[] = [];
  if (node.bindings) {
    props.push({ key: 'dataSource', label: 'Data source', propPath: 'bindings.dataSource', type: 'text' });
    props.push({ key: 'dataPathBind', label: 'Data path', propPath: 'bindings.dataPath', type: 'text' });
  } else {
    props.push({ key: 'dataSource', label: 'Data source', propPath: 'bindings.dataSource', type: 'text' });
    props.push({ key: 'dataPathBind', label: 'Data path', propPath: 'bindings.dataPath', type: 'text' });
  }
  if (node.kind === 'field') {
    const field = node as FieldNode;
    if (field.mask !== undefined || field.kind === 'field') {
      props.push({ key: 'mask', label: 'Mask', propPath: 'mask', type: 'text' });
      props.push({ key: 'format', label: 'Format', propPath: 'format', type: 'text' });
    }
  }
  return props;
}

function getLayoutProps(_node: FormNode): PropDef[] {
  return [
    { key: 'width', label: 'Width', propPath: 'layout.width', type: 'number' },
    { key: 'height', label: 'Height', propPath: 'layout.height', type: 'number' },
    { key: 'horizontalStretch', label: 'H stretch', propPath: 'layout.horizontalStretch', type: 'checkbox' },
    { key: 'verticalStretch', label: 'V stretch', propPath: 'layout.verticalStretch', type: 'checkbox' },
    { key: 'autoMaxWidth', label: 'Auto max width', propPath: 'layout.autoMaxWidth', type: 'checkbox' },
    { key: 'autoMaxHeight', label: 'Auto max height', propPath: 'layout.autoMaxHeight', type: 'checkbox' },
    {
      key: 'titleLocation',
      label: 'Title location',
      propPath: 'layout.titleLocation',
      type: 'select',
      options: TITLE_LOCATION_OPTIONS,
    },
  ];
}

function getStyleProps(_node: FormNode): PropDef[] {
  return [
    { key: 'fontName', label: 'Font', propPath: 'style.font.name', type: 'text' },
    { key: 'fontSize', label: 'Font size', propPath: 'style.font.size', type: 'number' },
    { key: 'fontBold', label: 'Bold', propPath: 'style.font.bold', type: 'checkbox' },
    { key: 'fontItalic', label: 'Italic', propPath: 'style.font.italic', type: 'checkbox' },
  ];
}

/* ------------------------------------------------------------------ */
/*  Get a nested property value by dot path                            */
/* ------------------------------------------------------------------ */

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/* ------------------------------------------------------------------ */
/*  InspectorRow                                                       */
/* ------------------------------------------------------------------ */

interface InspectorRowProps {
  prop: PropDef;
  node: FormNode;
  nodeId: string;
}

const InspectorRow: React.FC<InspectorRowProps> = React.memo(({ prop, node, nodeId }) => {
  const rawValue = getNestedValue(node as unknown as Record<string, unknown>, prop.propPath);

  const handleChange = useCallback(
    (value: unknown) => {
      const msg: UIToExtMessage = {
        type: 'cmd:applyPatch',
        patch: { op: 'setProp', nodeId, propPath: prop.propPath, value },
        patchId: crypto.randomUUID(),
        undoLabel: `Change ${prop.label}`,
      };
      postToExtension(msg);
    },
    [nodeId, prop.propPath, prop.label],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange(e.target.value);
    },
    [handleChange],
  );

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      handleChange(val === '' ? undefined : Number(val));
    },
    [handleChange],
  );

  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange(e.target.checked);
    },
    [handleChange],
  );

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      handleChange(e.target.value);
    },
    [handleChange],
  );

  const renderInput = (): React.ReactNode => {
    switch (prop.type) {
      case 'text':
        return (
          <input
            className="inspector-input"
            type="text"
            value={(rawValue as string) ?? ''}
            onChange={handleTextChange}
            readOnly={prop.readOnly}
          />
        );
      case 'number':
        return (
          <input
            className="inspector-input"
            type="number"
            value={rawValue != null ? String(rawValue) : ''}
            onChange={handleNumberChange}
            readOnly={prop.readOnly}
          />
        );
      case 'checkbox':
        return (
          <input
            className="inspector-input"
            type="checkbox"
            checked={Boolean(rawValue)}
            onChange={handleCheckboxChange}
            disabled={prop.readOnly}
          />
        );
      case 'select':
        return (
          <select
            className="inspector-input"
            value={(rawValue as string) ?? ''}
            onChange={handleSelectChange}
            disabled={prop.readOnly}
          >
            <option value="">(default)</option>
            {prop.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="inspector-row">
      <span className="inspector-label" title={prop.propPath}>
        {prop.label}
      </span>
      {renderInput()}
    </div>
  );
});

InspectorRow.displayName = 'InspectorRow';

/* ------------------------------------------------------------------ */
/*  InspectorSection                                                   */
/* ------------------------------------------------------------------ */

interface InspectorSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const InspectorSection: React.FC<InspectorSectionProps> = ({
  title,
  defaultExpanded = true,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`inspector-section ${expanded ? 'expanded' : ''}`}>
      <div
        className="inspector-section-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
        {title}
      </div>
      {expanded && <div className="inspector-section-body">{children}</div>}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  EventRow                                                           */
/* ------------------------------------------------------------------ */

interface EventRowProps {
  event: EventBinding;
}

const EventRow: React.FC<EventRowProps> = ({ event }) => {
  const handleClick = useCallback(() => {
    if (event.handler) {
      const msg: UIToExtMessage = { type: 'ui:openHandler', handlerName: event.handler };
      postToExtension(msg);
    }
  }, [event.handler]);

  return (
    <div className="inspector-row">
      <span className="inspector-label" title={event.event}>
        {event.event}
      </span>
      <input
        className="inspector-input"
        type="text"
        value={event.handler ?? ''}
        readOnly
        onClick={handleClick}
        style={{ cursor: event.handler ? 'pointer' : 'default' }}
        title={event.handler ? `Click to open handler: ${event.handler}` : 'No handler bound'}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Inspector                                                          */
/* ------------------------------------------------------------------ */

export const Inspector: React.FC = () => {
  const model = useDesignerStore((s) => s.model);
  const selectedNodeId = useDesignerStore((s) => s.selectedNodeId);

  const selectedNode = useMemo(() => {
    if (!model || !selectedNodeId) return null;
    return findNodeById(model, selectedNodeId);
  }, [model, selectedNodeId]);

  if (!selectedNode) {
    return (
      <div className="inspector-panel">
        <div className="inspector-empty">
          <span>Select an element to inspect its properties</span>
        </div>
      </div>
    );
  }

  const nodeId = selectedNode.id.internalId;
  const basicProps = getBasicProps(selectedNode);
  const visibilityProps = getVisibilityProps(selectedNode);
  const dataProps = getDataProps(selectedNode);
  const layoutProps = getLayoutProps(selectedNode);
  const styleProps = getStyleProps(selectedNode);
  const events = selectedNode.events ?? [];

  return (
    <div className="inspector-panel">
      {/* Node identity header */}
      <div className="inspector-node-header">
        <span className="inspector-node-kind">{selectedNode.kind}</span>
        <span className="inspector-node-name">{selectedNode.name}</span>
      </div>

      {/* Basic section */}
      <InspectorSection title="Basic" defaultExpanded={true}>
        {basicProps.map((prop) => (
          <InspectorRow key={prop.key} prop={prop} node={selectedNode} nodeId={nodeId} />
        ))}
      </InspectorSection>

      {/* Visibility section */}
      <InspectorSection title="Visibility" defaultExpanded={true}>
        {visibilityProps.map((prop) => (
          <InspectorRow key={prop.key} prop={prop} node={selectedNode} nodeId={nodeId} />
        ))}
      </InspectorSection>

      {/* Data section */}
      <InspectorSection title="Data" defaultExpanded={false}>
        {dataProps.map((prop) => (
          <InspectorRow key={prop.key} prop={prop} node={selectedNode} nodeId={nodeId} />
        ))}
      </InspectorSection>

      {/* Layout section */}
      <InspectorSection title="Layout" defaultExpanded={false}>
        {layoutProps.map((prop) => (
          <InspectorRow key={prop.key} prop={prop} node={selectedNode} nodeId={nodeId} />
        ))}
      </InspectorSection>

      {/* Style section */}
      <InspectorSection title="Style" defaultExpanded={false}>
        {styleProps.map((prop) => (
          <InspectorRow key={prop.key} prop={prop} node={selectedNode} nodeId={nodeId} />
        ))}
      </InspectorSection>

      {/* Events section */}
      <InspectorSection title="Events" defaultExpanded={false}>
        {events.length === 0 ? (
          <div className="inspector-row">
            <span className="inspector-label" style={{ opacity: 0.6 }}>
              No events bound
            </span>
          </div>
        ) : (
          events.map((evt) => <EventRow key={evt.event} event={evt} />)
        )}
      </InspectorSection>
    </div>
  );
};
