/**
 * FormModel Validator — checks structural invariants.
 */

import type {
  FormModel,
  FormRoot,
  FormNode,
  TableNode,
} from '../model/form-model';
import { walkFormTree } from '../model/node-utils';

export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeInternalId?: string;
  path?: string;
}

export function validateModel(model: FormModel): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  validateUniqueXmlIds(model, diagnostics);
  validateUniqueSiblingNames(model.form, diagnostics);
  validateTableColumnNames(model.form, diagnostics);
  validateNodeKinds(model.form, diagnostics);
  validateNesting(model.form, diagnostics);
  validateDataPaths(model.form, diagnostics);
  validateEventHandlers(model.form, diagnostics);

  return diagnostics;
}

/** xmlId must be unique across the entire form */
function validateUniqueXmlIds(model: FormModel, diagnostics: ValidationDiagnostic[]): void {
  const seen = new Map<string, string>(); // xmlId → name
  const check = (xmlId: string, name: string, internalId: string) => {
    if (xmlId === '0') return; // skip default
    if (seen.has(xmlId)) {
      diagnostics.push({
        severity: 'error',
        message: `Duplicate xmlId "${xmlId}": "${name}" conflicts with "${seen.get(xmlId)}"`,
        nodeInternalId: internalId,
      });
    } else {
      seen.set(xmlId, name);
    }
  };

  check(model.form.id.xmlId, model.form.name, model.form.id.internalId);

  walkFormTree(model.form, (node) => {
    check(node.id.xmlId, node.name, node.id.internalId);
    if (node.kind === 'table') {
      for (const col of (node as TableNode).columns) {
        check(col.id.xmlId, col.name, col.id.internalId);
      }
    }
  });
}

/** name must be unique among siblings */
function validateUniqueSiblingNames(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  function checkChildren(children: FormNode[], parentName: string): void {
    const names = new Map<string, string>();
    for (const child of children) {
      if (names.has(child.name)) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate name "${child.name}" among siblings of "${parentName}"`,
          nodeInternalId: child.id.internalId,
        });
      } else {
        names.set(child.name, child.id.internalId);
      }
    }
  }

  checkChildren(root.children, root.name);

  walkFormTree(root, (node) => {
    let children: FormNode[] | undefined;
    switch (node.kind) {
      case 'usualGroup':
      case 'page':
      case 'columnGroup':
        children = (node as { children: FormNode[] }).children;
        break;
      case 'pages':
        children = (node as { children: FormNode[] }).children;
        break;
      case 'commandBar':
      case 'autoCommandBar':
        children = (node as { children: FormNode[] }).children;
        break;
    }
    if (children) {
      checkChildren(children, node.name);
    }
  });
}

/** TableColumn names must be unique within a table */
function validateTableColumnNames(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  walkFormTree(root, (node) => {
    if (node.kind === 'table') {
      const table = node as TableNode;
      const names = new Set<string>();
      for (const col of table.columns) {
        if (names.has(col.name)) {
          diagnostics.push({
            severity: 'error',
            message: `Duplicate column name "${col.name}" in table "${table.name}"`,
            nodeInternalId: col.id.internalId,
          });
        } else {
          names.add(col.name);
        }
      }
    }
  });
}

/** kind must be a valid FormNode type */
const VALID_KINDS = new Set([
  'usualGroup', 'pages', 'page', 'columnGroup', 'commandBar', 'autoCommandBar',
  'field', 'decoration', 'button', 'table', 'unknown',
]);

function validateNodeKinds(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  walkFormTree(root, (node) => {
    if (!VALID_KINDS.has(node.kind)) {
      diagnostics.push({
        severity: 'error',
        message: `Invalid node kind "${node.kind}" for "${node.name}"`,
        nodeInternalId: node.id.internalId,
      });
    }
  });
}

/** PageNode only inside PagesNode, TableColumn only inside TableNode */
function validateNesting(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  walkFormTree(root, (node, parent) => {
    if (node.kind === 'page' && parent && 'kind' in parent && parent.kind !== 'pages') {
      diagnostics.push({
        severity: 'error',
        message: `PageNode "${node.name}" must be inside PagesNode, found in "${(parent as FormNode).name}"`,
        nodeInternalId: node.id.internalId,
      });
    }
  });
}

/** dataPath, if set, must be a non-empty string */
function validateDataPaths(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  walkFormTree(root, (node) => {
    if ('dataPath' in node) {
      const dp = (node as { dataPath?: string }).dataPath;
      if (dp !== undefined && dp.trim() === '') {
        diagnostics.push({
          severity: 'warning',
          message: `Empty dataPath in "${node.name}"`,
          nodeInternalId: node.id.internalId,
        });
      }
    }
  });
}

/** event handlers must be valid BSL identifiers */
function validateEventHandlers(root: FormRoot, diagnostics: ValidationDiagnostic[]): void {
  const bslIdentifier = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*$/;

  walkFormTree(root, (node) => {
    if (node.events) {
      for (const ev of node.events) {
        if (ev.handler && !bslIdentifier.test(ev.handler)) {
          diagnostics.push({
            severity: 'warning',
            message: `Invalid BSL handler name "${ev.handler}" for event "${ev.event}" in "${node.name}"`,
            nodeInternalId: node.id.internalId,
          });
        }
      }
    }
  });
}
