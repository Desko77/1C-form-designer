import React from 'react';
import { useDesignerStore } from './store/designer-store';
import { Toolbar } from './components/Toolbar/Toolbar';
import { TreePanel } from './components/Tree/TreePanel';
import { Canvas } from './components/Canvas/Canvas';
import { Inspector } from './components/Inspector/Inspector';
import { DiagnosticsPanel } from './components/Diagnostics/DiagnosticsPanel';
import { useBridge } from './bridge/use-bridge';
import './styles/designer.css';

export const App: React.FC = () => {
  useBridge();

  const activeView = useDesignerStore((s) => s.activeView);
  const model = useDesignerStore((s) => s.model);

  if (!model) {
    return (
      <div className="designer-loading">
        <span>Loading form...</span>
      </div>
    );
  }

  return (
    <div className="designer-root">
      <Toolbar />
      <div className="designer-body">
        {activeView !== 'source' && (
          <div className="designer-tree-panel">
            <TreePanel />
          </div>
        )}
        <div className="designer-center">
          {activeView === 'design' && <Canvas />}
          {activeView === 'structure' && (
            <div className="designer-structure-placeholder">
              <span>Structure mode — use the tree panel to navigate</span>
            </div>
          )}
          {activeView === 'source' && (
            <div className="designer-source-view">
              <pre>{JSON.stringify(model, null, 2)}</pre>
            </div>
          )}
        </div>
        {activeView !== 'source' && (
          <div className="designer-inspector-panel">
            <Inspector />
          </div>
        )}
      </div>
      <DiagnosticsPanel />
    </div>
  );
};
