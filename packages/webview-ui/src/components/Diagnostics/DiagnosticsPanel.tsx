import React, { useCallback, useMemo, useState } from 'react';
import { useDesignerStore } from '../../store/designer-store';
import { postToExtension } from '../../bridge/use-bridge';
import type { Diagnostic, UIToExtMessage } from '@1c-form-designer/shared';

/* ------------------------------------------------------------------ */
/*  Severity helpers                                                   */
/* ------------------------------------------------------------------ */

const SEVERITY_ICONS: Record<Diagnostic['severity'], string> = {
  error: '\u2716',    // heavy multiplication X
  warning: '\u26A0',  // warning sign
  info: '\u2139',     // info
};

const SEVERITY_CLASSES: Record<Diagnostic['severity'], string> = {
  error: 'diagnostic-error',
  warning: 'diagnostic-warning',
  info: 'diagnostic-info',
};

const SEVERITY_ORDER: Record<Diagnostic['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/* ------------------------------------------------------------------ */
/*  DiagnosticItem                                                     */
/* ------------------------------------------------------------------ */

interface DiagnosticItemProps {
  diagnostic: Diagnostic;
  onSelectNode: (nodeId: string) => void;
}

const DiagnosticItem: React.FC<DiagnosticItemProps> = React.memo(
  ({ diagnostic, onSelectNode }) => {
    const handleClick = useCallback(() => {
      if (diagnostic.nodeInternalId) {
        onSelectNode(diagnostic.nodeInternalId);
      }
    }, [diagnostic.nodeInternalId, onSelectNode]);

    return (
      <div
        className="diagnostic-item"
        onClick={handleClick}
        style={{ cursor: diagnostic.nodeInternalId ? 'pointer' : 'default' }}
        role="listitem"
      >
        <span className={`diagnostic-icon ${SEVERITY_CLASSES[diagnostic.severity]}`}>
          {SEVERITY_ICONS[diagnostic.severity]}
        </span>
        <span className="diagnostic-message">{diagnostic.message}</span>
        {diagnostic.path && (
          <span className="diagnostic-path" style={{ opacity: 0.6, marginLeft: 'auto', fontSize: 11 }}>
            {diagnostic.path}
          </span>
        )}
      </div>
    );
  },
);

DiagnosticItem.displayName = 'DiagnosticItem';

/* ------------------------------------------------------------------ */
/*  DiagnosticsPanel                                                   */
/* ------------------------------------------------------------------ */

export const DiagnosticsPanel: React.FC = () => {
  const diagnostics = useDesignerStore((s) => s.diagnostics);
  const selectNode = useDesignerStore((s) => s.selectNode);

  const [collapsed, setCollapsed] = useState(true);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      const msg: UIToExtMessage = { type: 'ui:selectNode', nodeInternalId: nodeId };
      postToExtension(msg);
    },
    [selectNode],
  );

  // Sort diagnostics: errors first, then warnings, then info
  const sortedDiagnostics = useMemo(() => {
    return [...diagnostics].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  }, [diagnostics]);

  // Count by severity for the header summary
  const counts = useMemo(() => {
    const result = { error: 0, warning: 0, info: 0 };
    for (const d of diagnostics) {
      const sev = d.severity as keyof typeof result;
      result[sev]++;
    }
    return result;
  }, [diagnostics]);

  return (
    <div className={`diagnostics-panel ${collapsed ? 'collapsed' : ''}`} role="region" aria-label="Diagnostics">
      <div
        className="diagnostics-header"
        onClick={handleToggle}
        role="button"
        aria-expanded={!collapsed}
      >
        <span>
          Problems
          {diagnostics.length > 0 && (
            <span style={{ fontWeight: 400, marginLeft: 8 }}>
              {counts.error > 0 && (
                <span className="diagnostic-error" style={{ marginRight: 8 }}>
                  {SEVERITY_ICONS.error} {counts.error}
                </span>
              )}
              {counts.warning > 0 && (
                <span className="diagnostic-warning" style={{ marginRight: 8 }}>
                  {SEVERITY_ICONS.warning} {counts.warning}
                </span>
              )}
              {counts.info > 0 && (
                <span className="diagnostic-info">
                  {SEVERITY_ICONS.info} {counts.info}
                </span>
              )}
            </span>
          )}
        </span>
        <span aria-hidden="true">{collapsed ? '\u25B6' : '\u25BC'}</span>
      </div>

      {!collapsed && (
        <div className="diagnostics-list" role="list">
          {sortedDiagnostics.length === 0 ? (
            <div className="diagnostic-item" style={{ opacity: 0.6 }}>
              <span className="diagnostic-icon diagnostic-info">{SEVERITY_ICONS.info}</span>
              <span>No problems detected</span>
            </div>
          ) : (
            sortedDiagnostics.map((diag, idx) => (
              <DiagnosticItem
                key={`${diag.severity}-${diag.message}-${idx}`}
                diagnostic={diag}
                onSelectNode={handleSelectNode}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
