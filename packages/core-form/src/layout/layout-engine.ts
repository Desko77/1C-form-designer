/**
 * Layout Engine — deterministic layout computation for 1C form elements.
 * Runs in Core (no DOM dependency). WebView renders the resulting LayoutBoxes.
 */

import { performance } from 'node:perf_hooks';
import type {
  FormRoot,
  FormNode,
  GroupType,
  TableNode,
  PagesNode,
  FieldNode,
  DecorationNode,
  LayoutProps,
} from '../model/form-model';
import type { FormPatch } from '../commands/command-engine';

// ─── Layout Types ───

export interface Size {
  width: number;
  height: number;
}

export interface LayoutResult {
  /** internalId → LayoutBox */
  boxes: Map<string, LayoutBox>;
  /** Total content size (for scrolling) */
  contentSize: Size;
  /** Computation time (ms) */
  computeTimeMs: number;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Baseline for label + widget alignment */
  baseline?: number;
  /** Is visible (accounts for visible flag + active page) */
  visible: boolean;
  /** For containers: direction */
  direction?: 'vertical' | 'horizontal';
}

// ─── Constants ───

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_LABEL_WIDTH = 120;
const DEFAULT_FIELD_HEIGHT = 28;
const DEFAULT_GROUP_PADDING = 8;
const DEFAULT_GROUP_HEADER_HEIGHT = 24;
const DEFAULT_TAB_BAR_HEIGHT = 32;
const DEFAULT_TABLE_HEADER_HEIGHT = 28;
const DEFAULT_TABLE_ROW_HEIGHT = 24;
const DEFAULT_BUTTON_HEIGHT = 28;
const DEFAULT_BUTTON_MIN_WIDTH = 80;
const DEFAULT_COMMAND_BAR_HEIGHT = 32;
const DEFAULT_DECORATION_HEIGHT = 20;
const MIN_ELEMENT_WIDTH = 40;
const DEFAULT_GAP = 4;

// ─── Layout Engine Interface ───

export interface ILayoutEngine {
  computeLayout(root: FormRoot, viewport: Size): LayoutResult;
  updateLayout(
    previous: LayoutResult,
    patch: FormPatch,
    root: FormRoot,
    viewport: Size,
  ): LayoutResult;
}

// ─── Implementation ───

export class LayoutEngine implements ILayoutEngine {
  computeLayout(root: FormRoot, viewport: Size): LayoutResult {
    const start = performance.now();
    const boxes = new Map<string, LayoutBox>();

    const availableRect: Rect = {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    };

    // Compute root container
    const contentHeight = this.layoutContainer(
      root.children,
      root.formProperties?.group || 'vertical',
      availableRect,
      boxes,
      true,
    );

    // Auto command bar at top
    if (root.autoCommandBar) {
      const acbBox: LayoutBox = {
        x: 0,
        y: 0,
        width: viewport.width,
        height: DEFAULT_COMMAND_BAR_HEIGHT,
        visible: root.autoCommandBar.visible !== false,
        direction: 'horizontal',
      };
      boxes.set(root.autoCommandBar.id.internalId, acbBox);

      // Layout auto command bar children
      this.layoutCommandBarChildren(root.autoCommandBar.children, acbBox, boxes);
    }

    const computeTimeMs = performance.now() - start;

    return {
      boxes,
      contentSize: { width: viewport.width, height: Math.max(contentHeight, viewport.height) },
      computeTimeMs,
    };
  }

  updateLayout(
    _previous: LayoutResult,
    _patch: FormPatch,
    root: FormRoot,
    viewport: Size,
  ): LayoutResult {
    // MVP: full recompute. Incremental optimization in v0.2+.
    return this.computeLayout(root, viewport);
  }

  private layoutContainer(
    children: FormNode[],
    group: GroupType | undefined,
    rect: Rect,
    boxes: Map<string, LayoutBox>,
    isRoot: boolean,
  ): number {
    const direction = resolveDirection(group);
    const visibleChildren = children.filter((c) => c.visible !== false);

    if (visibleChildren.length === 0) return rect.y;

    if (direction === 'horizontal') {
      return this.layoutHorizontal(visibleChildren, rect, boxes);
    } else {
      return this.layoutVertical(visibleChildren, rect, boxes, isRoot);
    }
  }

  private layoutVertical(
    children: FormNode[],
    rect: Rect,
    boxes: Map<string, LayoutBox>,
    _isRoot: boolean,
  ): number {
    let y = rect.y;

    // Pass 1: compute fixed-height elements
    let totalFixed = 0;
    let stretchCount = 0;

    for (const child of children) {
      const h = getFixedHeight(child);
      if (h !== null) {
        totalFixed += h + DEFAULT_GAP;
      } else if (child.layout?.verticalStretch) {
        stretchCount++;
      } else {
        totalFixed += estimateHeight(child) + DEFAULT_GAP;
      }
    }

    // Pass 2: distribute remaining space
    const remaining = Math.max(0, rect.height - totalFixed);
    const stretchShare = stretchCount > 0 ? remaining / stretchCount : 0;

    // Pass 3: layout each child
    for (const child of children) {
      const h = getFixedHeight(child) ?? (child.layout?.verticalStretch ? stretchShare : estimateHeight(child));
      const childRect: Rect = {
        x: rect.x,
        y,
        width: rect.width,
        height: h,
      };

      this.layoutNode(child, childRect, boxes);
      y += h + DEFAULT_GAP;
    }

    return y;
  }

  private layoutHorizontal(
    children: FormNode[],
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): number {
    let x = rect.x;
    let maxHeight = 0;

    // Pass 1: compute fixed widths
    let totalFixed = 0;
    let stretchCount = 0;

    for (const child of children) {
      const w = getFixedWidth(child);
      if (w !== null) {
        totalFixed += w + DEFAULT_GAP;
      } else if (child.layout?.horizontalStretch) {
        stretchCount++;
      } else {
        totalFixed += estimateWidth(child) + DEFAULT_GAP;
      }
    }

    const remaining = Math.max(0, rect.width - totalFixed);
    const stretchShare = stretchCount > 0 ? remaining / stretchCount : 0;

    // Pass 2: layout each child
    for (const child of children) {
      const w = getFixedWidth(child) ?? (child.layout?.horizontalStretch ? stretchShare : estimateWidth(child));
      const childRect: Rect = {
        x,
        y: rect.y,
        width: Math.max(w, MIN_ELEMENT_WIDTH),
        height: rect.height,
      };

      this.layoutNode(child, childRect, boxes);
      const box = boxes.get(child.id.internalId);
      if (box) maxHeight = Math.max(maxHeight, box.height);

      x += childRect.width + DEFAULT_GAP;
    }

    return rect.y + maxHeight;
  }

  private layoutNode(node: FormNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    switch (node.kind) {
      case 'usualGroup':
        this.layoutUsualGroup(node, rect, boxes);
        break;
      case 'pages':
        this.layoutPages(node as PagesNode, rect, boxes);
        break;
      case 'page':
        this.layoutPage(node, rect, boxes);
        break;
      case 'columnGroup':
        this.layoutColumnGroup(node, rect, boxes);
        break;
      case 'commandBar':
        this.layoutCommandBar(node, rect, boxes);
        break;
      case 'autoCommandBar':
        this.layoutAutoCommandBar(node, rect, boxes);
        break;
      case 'field':
        this.layoutField(node as FieldNode, rect, boxes);
        break;
      case 'decoration':
        this.layoutDecoration(node as DecorationNode, rect, boxes);
        break;
      case 'button':
        this.layoutButton(node, rect, boxes);
        break;
      case 'table':
        this.layoutTable(node as TableNode, rect, boxes);
        break;
      case 'unknown':
        this.layoutUnknown(node, rect, boxes);
        break;
    }
  }

  private layoutUsualGroup(
    node: FormNode & { children: FormNode[]; group?: GroupType; showTitle?: boolean },
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): void {
    const direction = resolveDirection(node.group);
    const hasTitle = node.showTitle !== false && node.caption;
    const headerH = hasTitle ? DEFAULT_GROUP_HEADER_HEIGHT : 0;

    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: true,
      direction,
    };

    const contentRect: Rect = {
      x: rect.x + DEFAULT_GROUP_PADDING,
      y: rect.y + headerH + DEFAULT_GROUP_PADDING,
      width: rect.width - DEFAULT_GROUP_PADDING * 2,
      height: rect.height - headerH - DEFAULT_GROUP_PADDING * 2,
    };

    const bottomY = this.layoutContainer(node.children, node.group, contentRect, boxes, false);
    box.height = Math.max(bottomY - rect.y + DEFAULT_GROUP_PADDING, headerH + DEFAULT_GROUP_PADDING * 2);
    boxes.set(node.id.internalId, box);
  }

  private layoutPages(node: PagesNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: true,
      direction: 'vertical',
    };
    boxes.set(node.id.internalId, box);

    // Tab bar
    const contentRect: Rect = {
      x: rect.x,
      y: rect.y + DEFAULT_TAB_BAR_HEIGHT,
      width: rect.width,
      height: rect.height - DEFAULT_TAB_BAR_HEIGHT,
    };

    // Layout only the first (active) page
    if (node.children.length > 0) {
      this.layoutNode(node.children[0], contentRect, boxes);
      // Mark other pages as invisible
      for (let i = 1; i < node.children.length; i++) {
        boxes.set(node.children[i].id.internalId, {
          x: 0, y: 0, width: 0, height: 0, visible: false,
        });
      }
    }
  }

  private layoutPage(
    node: FormNode & { children: FormNode[]; group?: GroupType },
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): void {
    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: true,
      direction: 'vertical',
    };

    const contentRect: Rect = {
      x: rect.x + DEFAULT_GROUP_PADDING,
      y: rect.y + DEFAULT_GROUP_PADDING,
      width: rect.width - DEFAULT_GROUP_PADDING * 2,
      height: rect.height - DEFAULT_GROUP_PADDING * 2,
    };

    const bottomY = this.layoutContainer(node.children, node.group || 'vertical', contentRect, boxes, false);
    box.height = Math.max(bottomY - rect.y + DEFAULT_GROUP_PADDING, DEFAULT_GROUP_PADDING * 2);
    boxes.set(node.id.internalId, box);
  }

  private layoutColumnGroup(
    node: FormNode & { children: FormNode[]; group?: GroupType },
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): void {
    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible: true,
      direction: 'horizontal',
    };
    boxes.set(node.id.internalId, box);

    // Equal-width columns
    const visibleChildren = node.children.filter((c) => c.visible !== false);
    if (visibleChildren.length === 0) return;

    const colWidth = (rect.width - DEFAULT_GAP * (visibleChildren.length - 1)) / visibleChildren.length;
    let x = rect.x;
    let maxHeight = 0;

    for (const child of visibleChildren) {
      const childRect: Rect = { x, y: rect.y, width: colWidth, height: rect.height };
      this.layoutNode(child, childRect, boxes);
      const childBox = boxes.get(child.id.internalId);
      if (childBox) maxHeight = Math.max(maxHeight, childBox.height);
      x += colWidth + DEFAULT_GAP;
    }

    box.height = maxHeight;
  }

  private layoutCommandBar(
    node: FormNode & { children: FormNode[] },
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): void {
    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: DEFAULT_COMMAND_BAR_HEIGHT,
      visible: true,
      direction: 'horizontal',
    };
    boxes.set(node.id.internalId, box);

    this.layoutCommandBarChildren(node.children, box, boxes);
  }

  private layoutAutoCommandBar(
    node: FormNode & { children: FormNode[] },
    rect: Rect,
    boxes: Map<string, LayoutBox>,
  ): void {
    const box: LayoutBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: DEFAULT_COMMAND_BAR_HEIGHT,
      visible: true,
      direction: 'horizontal',
    };
    boxes.set(node.id.internalId, box);

    this.layoutCommandBarChildren(node.children, box, boxes);
  }

  private layoutCommandBarChildren(
    children: FormNode[],
    parentBox: LayoutBox,
    boxes: Map<string, LayoutBox>,
  ): void {
    let x = parentBox.x + DEFAULT_GAP;
    for (const child of children) {
      if (child.visible === false) continue;
      const w = child.layout?.width || DEFAULT_BUTTON_MIN_WIDTH;
      boxes.set(child.id.internalId, {
        x,
        y: parentBox.y + 2,
        width: w,
        height: DEFAULT_BUTTON_HEIGHT,
        visible: true,
      });
      x += w + DEFAULT_GAP;
    }
  }

  private layoutField(node: FieldNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    const h = node.layout?.height || (node.multiLine ? DEFAULT_FIELD_HEIGHT * 3 : DEFAULT_FIELD_HEIGHT);
    boxes.set(node.id.internalId, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: h,
      baseline: h / 2,
      visible: true,
    });
  }

  private layoutDecoration(node: DecorationNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    const h = node.layout?.height || DEFAULT_DECORATION_HEIGHT;
    boxes.set(node.id.internalId, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: h,
      visible: true,
    });
  }

  private layoutButton(node: FormNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    const w = node.layout?.width || DEFAULT_BUTTON_MIN_WIDTH;
    boxes.set(node.id.internalId, {
      x: rect.x,
      y: rect.y,
      width: w,
      height: DEFAULT_BUTTON_HEIGHT,
      visible: true,
    });
  }

  private layoutTable(node: TableNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    const rowCount = node.rowCount || 5;
    const headerH = node.header !== false ? DEFAULT_TABLE_HEADER_HEIGHT : 0;
    const h = node.layout?.height || (headerH + rowCount * DEFAULT_TABLE_ROW_HEIGHT);

    boxes.set(node.id.internalId, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: h,
      visible: true,
    });

    // Layout column headers
    let colX = rect.x;
    for (const col of node.columns) {
      if (col.visible === false) continue;
      const colW = col.width || 100;
      boxes.set(col.id.internalId, {
        x: colX,
        y: rect.y,
        width: colW,
        height: headerH,
        visible: true,
      });
      colX += colW;
    }
  }

  private layoutUnknown(node: FormNode, rect: Rect, boxes: Map<string, LayoutBox>): void {
    boxes.set(node.id.internalId, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: DEFAULT_FIELD_HEIGHT,
      visible: true,
    });
  }
}

// ─── Helpers ───

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveDirection(group?: GroupType): 'vertical' | 'horizontal' {
  switch (group) {
    case 'horizontal':
    case 'alwaysHorizontal':
    case 'horizontalIfPossible':
      return 'horizontal';
    default:
      return 'vertical';
  }
}

function getFixedHeight(node: FormNode): number | null {
  return node.layout?.height ?? null;
}

function getFixedWidth(node: FormNode): number | null {
  return node.layout?.width ?? null;
}

function estimateHeight(node: FormNode): number {
  switch (node.kind) {
    case 'field':
      return (node as FieldNode).multiLine ? DEFAULT_FIELD_HEIGHT * 3 : DEFAULT_FIELD_HEIGHT;
    case 'decoration':
      return DEFAULT_DECORATION_HEIGHT;
    case 'button':
      return DEFAULT_BUTTON_HEIGHT;
    case 'commandBar':
    case 'autoCommandBar':
      return DEFAULT_COMMAND_BAR_HEIGHT;
    case 'table': {
      const t = node as TableNode;
      const rows = t.rowCount || 5;
      return DEFAULT_TABLE_HEADER_HEIGHT + rows * DEFAULT_TABLE_ROW_HEIGHT;
    }
    case 'usualGroup':
    case 'page':
    case 'columnGroup': {
      const children = (node as { children: FormNode[] }).children || [];
      const visible = children.filter((c) => c.visible !== false);
      let h = 0;
      for (const child of visible) {
        h += estimateHeight(child) + DEFAULT_GAP;
      }
      return h + DEFAULT_GROUP_PADDING * 2 + (node.caption ? DEFAULT_GROUP_HEADER_HEIGHT : 0);
    }
    case 'pages':
      return DEFAULT_TAB_BAR_HEIGHT + 200;
    default:
      return DEFAULT_FIELD_HEIGHT;
  }
}

function estimateWidth(node: FormNode): number {
  switch (node.kind) {
    case 'button':
      return DEFAULT_BUTTON_MIN_WIDTH;
    case 'field':
      return DEFAULT_LABEL_WIDTH + 200;
    default:
      return 200;
  }
}

/** Create a default LayoutEngine instance */
export function createLayoutEngine(): ILayoutEngine {
  return new LayoutEngine();
}
