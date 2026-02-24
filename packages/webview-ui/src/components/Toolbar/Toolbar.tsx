import React, { useCallback, useEffect, useRef } from 'react';
import { useDesignerStore } from '../../store/designer-store';
import { postToExtension } from '../../bridge/use-bridge';
import type { UIToExtMessage } from '@1c-form-designer/shared';

const VIEW_MODES = [
  { key: 'design', label: 'Design', icon: '\u{1F4D0}' },
  { key: 'structure', label: 'Structure', icon: '\u{1F332}' },
  { key: 'source', label: 'Source', icon: '\u{1F4C4}' },
] as const;

export const Toolbar: React.FC = () => {
  const activeView = useDesignerStore((s) => s.activeView);
  const isDirty = useDesignerStore((s) => s.isDirty);
  const searchQuery = useDesignerStore((s) => s.searchQuery);
  const setActiveView = useDesignerStore((s) => s.setActiveView);
  const setSearchQuery = useDesignerStore((s) => s.setSearchQuery);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleUndo = useCallback(() => {
    const msg: UIToExtMessage = { type: 'cmd:requestUndo' };
    postToExtension(msg);
  }, []);

  const handleRedo = useCallback(() => {
    const msg: UIToExtMessage = { type: 'cmd:requestRedo' };
    postToExtension(msg);
  }, []);

  const handleSave = useCallback(() => {
    const msg: UIToExtMessage = { type: 'cmd:requestSave' };
    postToExtension(msg);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, [setSearchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (mod && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSave]);

  return (
    <div className="designer-toolbar" role="toolbar" aria-label="Form designer toolbar">
      {/* View mode buttons */}
      <div className="toolbar-view-group" role="radiogroup" aria-label="View mode">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.key}
            className={activeView === mode.key ? 'active' : ''}
            onClick={() => setActiveView(mode.key)}
            title={`${mode.label} view`}
            role="radio"
            aria-checked={activeView === mode.key}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <span className="toolbar-separator" aria-hidden="true" />

      {/* Undo / Redo */}
      <button
        onClick={handleUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        &#x21B6;
      </button>
      <button
        onClick={handleRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
      >
        &#x21B7;
      </button>

      <span className="toolbar-separator" aria-hidden="true" />

      {/* Save + dirty indicator */}
      <button
        onClick={handleSave}
        title="Save (Ctrl+S)"
        aria-label="Save"
      >
        Save
      </button>
      {isDirty && (
        <span
          className="dirty-indicator"
          title="Unsaved changes"
          aria-label="Unsaved changes"
        />
      )}

      {/* Spacer */}
      <div style={{ flex: '1 1 auto' }} />

      {/* Search */}
      <input
        ref={searchInputRef}
        className="toolbar-search-input"
        type="text"
        placeholder="Search elements... (Ctrl+F)"
        value={searchQuery}
        onChange={handleSearchChange}
        aria-label="Search elements"
      />
      {searchQuery && (
        <button
          onClick={handleClearSearch}
          title="Clear search"
          aria-label="Clear search"
        >
          &#x2715;
        </button>
      )}
    </div>
  );
};
