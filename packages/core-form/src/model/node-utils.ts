/**
 * Utility functions for working with FormModel nodes.
 */

import { randomUUID } from 'node:crypto';
import type {
  FormModel,
  FormRoot,
  FormNode,
  NodeIdentity,
  TableNode,
} from './form-model';

/** Traverse all nodes in the form tree, invoking callback for each */
export function walkFormTree(
  root: FormRoot,
  callback: (node: FormNode, parent: FormNode | FormRoot | null, depth: number) => void,
): void {
  function walkChildren(children: FormNode[], parent: FormNode | FormRoot, depth: number): void {
    for (const child of children) {
      callback(child, parent, depth);
      walkNode(child, depth);
    }
  }

  function walkNode(node: FormNode, depth: number): void {
    const nextDepth = depth + 1;
    switch (node.kind) {
      case 'usualGroup':
      case 'page':
      case 'columnGroup':
        walkChildren(node.children, node, nextDepth);
        break;
      case 'pages':
        walkChildren(node.children, node, nextDepth);
        break;
      case 'commandBar':
        walkChildren(node.children, node, nextDepth);
        break;
      case 'autoCommandBar':
        walkChildren(node.children, node, nextDepth);
        break;
      case 'table':
        if (node.commandBar) {
          callback(node.commandBar, node, nextDepth);
          walkNode(node.commandBar, nextDepth);
        }
        break;
      case 'unknown':
        if (node.children) {
          walkChildren(node.children, node, nextDepth);
        }
        break;
      // field, decoration, button — leaf nodes
    }
  }

  walkChildren(root.children, root, 0);
  if (root.autoCommandBar) {
    callback(root.autoCommandBar, root, 0);
    walkNode(root.autoCommandBar, 0);
  }
}

/** Find a node by internalId */
export function findNodeByInternalId(root: FormRoot, internalId: string): FormNode | null {
  let found: FormNode | null = null;
  walkFormTree(root, (node) => {
    if (!found && node.id.internalId === internalId) {
      found = node;
    }
  });
  return found;
}

/** Find a node by xmlId */
export function findNodeByXmlId(root: FormRoot, xmlId: string): FormNode | null {
  let found: FormNode | null = null;
  walkFormTree(root, (node) => {
    if (!found && node.id.xmlId === xmlId) {
      found = node;
    }
  });
  return found;
}

/** Build an index of all nodes by internalId for fast lookup */
export type NodeIndex = Map<string, FormNode>;

export function buildNodeIndex(root: FormRoot): NodeIndex {
  const index: NodeIndex = new Map();
  walkFormTree(root, (node) => {
    index.set(node.id.internalId, node);
  });
  return index;
}

/** Collect all xmlIds from the model */
export function collectAllXmlIds(model: FormModel): string[] {
  const ids: string[] = [model.form.id.xmlId];

  walkFormTree(model.form, (node) => {
    ids.push(node.id.xmlId);
  });

  // Table columns
  walkFormTree(model.form, (node) => {
    if (node.kind === 'table') {
      for (const col of (node as TableNode).columns) {
        ids.push(col.id.xmlId);
      }
    }
  });

  // Attributes
  if (model.attributes) {
    function collectAttrIds(attrs: { id: NodeIdentity; children?: { id: NodeIdentity }[] }[]): void {
      for (const attr of attrs) {
        ids.push(attr.id.xmlId);
        if ('children' in attr && attr.children) {
          collectAttrIds(attr.children as typeof attrs);
        }
      }
    }
    collectAttrIds(model.attributes);
  }

  // Commands
  if (model.commands) {
    for (const cmd of model.commands) {
      ids.push(cmd.id.xmlId);
    }
  }

  return ids;
}

/** Generate a new xmlId (reproduces 1C behavior: max + 1) */
export function generateNewXmlId(model: FormModel): string {
  const allIds = collectAllXmlIds(model);
  const numericIds = allIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));
  if (numericIds.length === 0) return '1';
  return String(Math.max(...numericIds) + 1);
}

/** Generate a new NodeIdentity */
export function createNodeIdentity(model: FormModel): NodeIdentity {
  return {
    xmlId: generateNewXmlId(model),
    internalId: randomUUID(),
  };
}

/** Find parent of a node by its internalId */
export function findParent(
  root: FormRoot,
  targetInternalId: string,
): { parent: FormNode | FormRoot; index: number } | null {
  // Check root children
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id.internalId === targetInternalId) {
      return { parent: root, index: i };
    }
  }

  let result: { parent: FormNode | FormRoot; index: number } | null = null;

  walkFormTree(root, (node) => {
    if (result) return;
    let children: FormNode[] | undefined;

    switch (node.kind) {
      case 'usualGroup':
      case 'page':
      case 'columnGroup':
      case 'pages':
      case 'commandBar':
      case 'autoCommandBar':
        children = node.children as FormNode[];
        break;
      case 'unknown':
        children = node.children;
        break;
    }

    if (children) {
      for (let i = 0; i < children.length; i++) {
        if (children[i].id.internalId === targetInternalId) {
          result = { parent: node, index: i };
          return;
        }
      }
    }
  });

  return result;
}

/** Deep clone a FormModel (immutable operations helper) */
export function cloneModel(model: FormModel): FormModel {
  return JSON.parse(JSON.stringify(model));
}
