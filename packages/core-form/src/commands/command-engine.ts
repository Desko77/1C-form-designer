/**
 * Command Engine — immutable patch model with Undo/Redo and coalescing.
 */

import { randomUUID } from 'node:crypto';
import type {
  FormModel,
  FormNode,
  FormRoot,
} from '../model/form-model';
import { cloneModel, findParent, walkFormTree } from '../model/node-utils';
import { validateModel, type ValidationDiagnostic } from '../validator/validator';

// ─── Patch Types ───

export type FormPatch =
  | { op: 'addNode'; parentId: string; node: FormNode; index?: number }
  | { op: 'removeNode'; nodeId: string }
  | { op: 'moveNode'; nodeId: string; newParentId: string; index: number }
  | { op: 'setProp'; nodeId: string; propPath: string; value: unknown }
  | { op: 'batch'; patches: FormPatch[] };

// ─── Undo Entry ───

interface UndoEntry {
  id: string;
  label: string;
  forward: FormPatch;
  inverse: FormPatch;
  timestamp: number;
}

// ─── Command Result ───

export interface CommandResult {
  model: FormModel;
  diagnostics: ValidationDiagnostic[];
  patchId: string;
}

// ─── Command Engine ───

export interface ICommandEngine {
  apply(model: FormModel, patch: FormPatch, label?: string): CommandResult;
  undo(model: FormModel): CommandResult | null;
  redo(model: FormModel): CommandResult | null;

  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  readonly stackSize: number;
}

export class CommandEngine implements ICommandEngine {
  private undoStack: UndoEntry[] = [];
  private pointer = -1;
  private maxSize: number;
  private coalesceWindowMs: number;

  constructor(maxSize = 200, coalesceWindowMs = 500) {
    this.maxSize = maxSize;
    this.coalesceWindowMs = coalesceWindowMs;
  }

  get canUndo(): boolean {
    return this.pointer >= 0;
  }

  get canRedo(): boolean {
    return this.pointer < this.undoStack.length - 1;
  }

  get undoLabel(): string | undefined {
    if (this.pointer < 0) return undefined;
    return this.undoStack[this.pointer].label;
  }

  get redoLabel(): string | undefined {
    if (this.pointer >= this.undoStack.length - 1) return undefined;
    return this.undoStack[this.pointer + 1].label;
  }

  get stackSize(): number {
    return this.undoStack.length;
  }

  apply(model: FormModel, patch: FormPatch, label?: string): CommandResult {
    const patchId = randomUUID();
    const newModel = cloneModel(model);

    applyPatch(newModel, patch);

    const inverse = computeInverse(model, patch);
    const resolvedLabel = label || describeOperation(patch);
    const now = Date.now();

    // Check coalescing
    if (this.shouldCoalesce(patch, now)) {
      // Merge with last entry
      const last = this.undoStack[this.pointer];
      last.forward = patch;
      last.inverse = computeInverse(model, patch);
      last.timestamp = now;
    } else {
      // Truncate redo stack
      this.undoStack.splice(this.pointer + 1);

      // Push new entry
      this.undoStack.push({
        id: patchId,
        label: resolvedLabel,
        forward: patch,
        inverse,
        timestamp: now,
      });
      this.pointer++;

      // Enforce max size
      while (this.undoStack.length > this.maxSize) {
        this.undoStack.shift();
        this.pointer--;
      }
    }

    const diagnostics = validateModel(newModel);

    return { model: newModel, diagnostics, patchId };
  }

  undo(model: FormModel): CommandResult | null {
    if (!this.canUndo) return null;

    const entry = this.undoStack[this.pointer];
    const newModel = cloneModel(model);
    applyPatch(newModel, entry.inverse);
    this.pointer--;

    const diagnostics = validateModel(newModel);
    return { model: newModel, diagnostics, patchId: entry.id };
  }

  redo(model: FormModel): CommandResult | null {
    if (!this.canRedo) return null;

    this.pointer++;
    const entry = this.undoStack[this.pointer];
    const newModel = cloneModel(model);
    applyPatch(newModel, entry.forward);

    const diagnostics = validateModel(newModel);
    return { model: newModel, diagnostics, patchId: entry.id };
  }

  private shouldCoalesce(patch: FormPatch, now: number): boolean {
    if (this.pointer < 0) return false;
    const last = this.undoStack[this.pointer];

    // Only coalesce setProp with same nodeId and propPath within time window
    if (patch.op !== 'setProp' || last.forward.op !== 'setProp') return false;
    if (patch.nodeId !== last.forward.nodeId) return false;
    if (patch.propPath !== last.forward.propPath) return false;
    if (now - last.timestamp > this.coalesceWindowMs) return false;

    return true;
  }
}

// ─── Patch Application ───

function applyPatch(model: FormModel, patch: FormPatch): void {
  switch (patch.op) {
    case 'addNode':
      applyAddNode(model.form, patch.parentId, patch.node, patch.index);
      break;
    case 'removeNode':
      applyRemoveNode(model.form, patch.nodeId);
      break;
    case 'moveNode':
      applyMoveNode(model.form, patch.nodeId, patch.newParentId, patch.index);
      break;
    case 'setProp':
      applySetProp(model.form, patch.nodeId, patch.propPath, patch.value);
      break;
    case 'batch':
      for (const p of patch.patches) {
        applyPatch(model, p);
      }
      break;
  }
}

function applyAddNode(root: FormRoot, parentId: string, node: FormNode, index?: number): void {
  const children = findChildrenArray(root, parentId);
  if (!children) return;
  if (index !== undefined && index >= 0 && index <= children.length) {
    children.splice(index, 0, node);
  } else {
    children.push(node);
  }
}

function applyRemoveNode(root: FormRoot, nodeId: string): void {
  const result = findParent(root, nodeId);
  if (!result) return;
  const children = getChildrenOfParent(result.parent);
  if (children) {
    children.splice(result.index, 1);
  }
}

function applyMoveNode(root: FormRoot, nodeId: string, newParentId: string, index: number): void {
  // Find and remove from current position
  const result = findParent(root, nodeId);
  if (!result) return;
  const currentChildren = getChildrenOfParent(result.parent);
  if (!currentChildren) return;

  const [node] = currentChildren.splice(result.index, 1);
  if (!node) return;

  // Add to new position
  const newChildren = findChildrenArray(root, newParentId);
  if (!newChildren) return;

  const clampedIndex = Math.min(index, newChildren.length);
  newChildren.splice(clampedIndex, 0, node);
}

function applySetProp(root: FormRoot, nodeId: string, propPath: string, value: unknown): void {
  // Check if targeting root
  if (root.id.internalId === nodeId) {
    setNestedProp(root as unknown as Record<string, unknown>, propPath, value);
    return;
  }

  // Find node
  let target: FormNode | null = null;
  walkFormTree(root, (node: FormNode) => {
    if (!target && node.id.internalId === nodeId) {
      target = node;
    }
  });

  if (target) {
    setNestedProp(target as unknown as Record<string, unknown>, propPath, value);
  }
}

function setNestedProp(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
}

// ─── Children Array Helpers ───

function findChildrenArray(root: FormRoot, parentId: string): FormNode[] | null {
  if (root.id.internalId === parentId) {
    return root.children;
  }

  let found: FormNode[] | null = null;
  // walkFormTree imported at top
  walkFormTree(root, (node: FormNode) => {
    if (found) return;
    if (node.id.internalId === parentId) {
      found = getChildrenOfNode(node);
    }
  });

  return found;
}

function getChildrenOfParent(parent: FormNode | FormRoot): FormNode[] | null {
  if ('children' in parent && Array.isArray(parent.children)) {
    return parent.children;
  }
  return null;
}

function getChildrenOfNode(node: FormNode): FormNode[] | null {
  switch (node.kind) {
    case 'usualGroup':
    case 'page':
    case 'columnGroup':
    case 'pages':
    case 'commandBar':
    case 'autoCommandBar':
      return (node as { children: FormNode[] }).children;
    case 'unknown':
      if ('children' in node && Array.isArray(node.children)) {
        return node.children as FormNode[];
      }
      return null;
    default:
      return null;
  }
}

// ─── Inverse Computation ───

function computeInverse(model: FormModel, patch: FormPatch): FormPatch {
  switch (patch.op) {
    case 'addNode':
      return { op: 'removeNode', nodeId: patch.node.id.internalId };

    case 'removeNode': {
      const result = findParent(model.form, patch.nodeId);
      if (!result) return { op: 'batch', patches: [] };
      const children = getChildrenOfParent(result.parent);
      const node = children ? children[result.index] : null;
      if (!node) return { op: 'batch', patches: [] };
      const parentId = 'id' in result.parent ? result.parent.id.internalId : model.form.id.internalId;
      return { op: 'addNode', parentId, node: JSON.parse(JSON.stringify(node)), index: result.index };
    }

    case 'moveNode': {
      const result = findParent(model.form, patch.nodeId);
      if (!result) return { op: 'batch', patches: [] };
      const parentId = 'id' in result.parent ? result.parent.id.internalId : model.form.id.internalId;
      return { op: 'moveNode', nodeId: patch.nodeId, newParentId: parentId, index: result.index };
    }

    case 'setProp': {
      const node = findNodeForProp(model.form, patch.nodeId);
      if (!node) return { op: 'batch', patches: [] };
      const oldValue = getNestedProp(node as unknown as Record<string, unknown>, patch.propPath);
      return { op: 'setProp', nodeId: patch.nodeId, propPath: patch.propPath, value: oldValue };
    }

    case 'batch':
      return {
        op: 'batch',
        patches: patch.patches.map((p) => computeInverse(model, p)).reverse(),
      };
  }
}

function findNodeForProp(root: FormRoot, nodeId: string): FormNode | FormRoot | null {
  if (root.id.internalId === nodeId) return root;
  let found: FormNode | null = null;
  // walkFormTree imported at top
  walkFormTree(root, (node: FormNode) => {
    if (!found && node.id.internalId === nodeId) {
      found = node;
    }
  });
  return found;
}

function getNestedProp(obj: Record<string, unknown>, path: string): unknown {
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

// ─── Operation Description ───

function describeOperation(patch: FormPatch): string {
  switch (patch.op) {
    case 'addNode':
      return `Add ${patch.node.kind} "${patch.node.name}"`;
    case 'removeNode':
      return `Remove element`;
    case 'moveNode':
      return `Move element`;
    case 'setProp':
      return `Change ${patch.propPath}`;
    case 'batch':
      return `Batch (${patch.patches.length} operations)`;
  }
}
