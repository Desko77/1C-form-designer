/**
 * XML Serializer: transforms FormModel back into 1C managed form XML (EDT format).
 * Preserves unknown blocks, xmlns, and element ordering.
 */

import type {
  FormModel,
  FormRoot,
  FormNode,
  FormAttribute,
  FormCommand,
  UnknownBlock,
  LocalizedString,
  NodeIdentity,
  LayoutProps,
  StyleProps,
  BindingProps,
  EventBinding,
  PictureRef,
  ColorRef,
  FontRef,
  GroupType,
  FieldNode,
  DecorationNode,
  ButtonNode,
  TableNode,
  TableColumn,
  UsualGroupNode,
  PagesNode,
  PageNode,
  ColumnGroupNode,
  CommandBarNode,
  AutoCommandBarNode,
  UnknownElementNode,
} from '../model/form-model';
import {
  MODEL_TO_XML_KIND,
  FIELD_TYPE_TO_XML_KIND,
  DECORATION_TYPE_TO_XML_KIND,
  GROUP_TYPE_TO_XML,
  KNOWN_NAMESPACES,
} from '../parser/xml-mapping';

export interface SerializeOptions {
  indent?: string;
  mode?: 'preserve' | 'canonical';
}

const DEFAULT_OPTIONS: Required<SerializeOptions> = {
  indent: '\t',
  mode: 'preserve',
};

export function serializeModelToXml(model: FormModel, options?: SerializeOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ctx = new SerializerContext(opts.indent);

  ctx.appendLine('<?xml version="1.0" encoding="UTF-8"?>');

  // Build root element attributes
  const rootAttrs: string[] = [];

  // Namespaces
  const ns = model.meta?.xmlNamespaces || {};
  const hasXsi = Object.values(ns).includes(KNOWN_NAMESPACES.xsi);
  const hasCore = Object.values(ns).includes(KNOWN_NAMESPACES.core);
  const hasMdclass = Object.values(ns).includes(KNOWN_NAMESPACES.mdclass);

  if (!hasXsi) rootAttrs.push(`xmlns:xsi="${KNOWN_NAMESPACES.xsi}"`);
  if (!hasCore) rootAttrs.push(`xmlns:core="${KNOWN_NAMESPACES.core}"`);
  if (!hasMdclass) rootAttrs.push(`xmlns:mdclass="${KNOWN_NAMESPACES.mdclass}"`);

  for (const [prefix, uri] of Object.entries(ns)) {
    if (prefix) {
      rootAttrs.push(`xmlns:${prefix}="${uri}"`);
    } else {
      rootAttrs.push(`xmlns="${uri}"`);
    }
  }

  // UUID
  if (model.form.id.xmlId && model.form.id.xmlId !== '0') {
    rootAttrs.push(`uuid="${escapeXml(model.form.id.xmlId)}"`);
  }

  const rootTag = 'mdclass:ManagedForm';
  ctx.openTag(rootTag, rootAttrs);

  // producedTypes — insert unknown block if present
  insertUnknownBlock(ctx, model.unknownBlocks, 'producedTypes');

  // Name
  ctx.simpleElement('n', model.form.name);

  // Title
  serializeLocalizedString(ctx, 'title', model.form.caption);

  // usePurposes
  insertUnknownBlock(ctx, model.unknownBlocks, 'usePurposes');

  // Form root properties
  serializeFormRootProperties(ctx, model.form.formProperties);

  // Attributes
  if (model.attributes && model.attributes.length > 0) {
    for (const attr of model.attributes) {
      serializeFormAttribute(ctx, attr);
    }
  }

  // Elements
  if (model.form.autoCommandBar) {
    serializeElement(ctx, model.form.autoCommandBar);
  }
  for (const child of model.form.children) {
    serializeElement(ctx, child);
  }

  // Commands
  if (model.commands && model.commands.length > 0) {
    for (const cmd of model.commands) {
      serializeFormCommand(ctx, cmd);
    }
  }

  // Remaining unknown top-level blocks
  if (model.unknownBlocks) {
    for (const block of model.unknownBlocks) {
      if (!['producedTypes', 'usePurposes'].includes(block.key)) {
        ctx.appendRawLine(tryParseStoredXml(block.xml, block.key, ctx.currentIndent()));
      }
    }
  }

  ctx.closeTag(rootTag);

  return ctx.toString();
}

// ─── Element Serialization ───

function serializeElement(ctx: SerializerContext, node: FormNode): void {
  if (node.kind === 'unknown') {
    serializeUnknownElement(ctx, node as UnknownElementNode);
    return;
  }

  const mapping = MODEL_TO_XML_KIND[node.kind];
  if (!mapping) return;

  const attrs: string[] = [`xsi:type="${mapping.xsiType}"`];
  if (node.id.xmlId && node.id.xmlId !== '0') {
    attrs.push(`id="${escapeXml(node.id.xmlId)}"`);
  }
  attrs.push(`name="${escapeXml(node.name)}"`);

  ctx.openTag('elements', attrs);

  // Kind element
  if (mapping.xmlKind) {
    ctx.simpleElement('kind', mapping.xmlKind);
  } else if (node.kind === 'field') {
    const fieldNode = node as FieldNode;
    const xmlKind = FIELD_TYPE_TO_XML_KIND[fieldNode.fieldType];
    if (xmlKind) ctx.simpleElement('kind', xmlKind);
  } else if (node.kind === 'decoration') {
    const decNode = node as DecorationNode;
    const xmlKind = DECORATION_TYPE_TO_XML_KIND[decNode.decorationType];
    if (xmlKind) ctx.simpleElement('kind', xmlKind);
  }

  // Common properties
  serializeBaseProperties(ctx, node);

  // Type-specific properties
  switch (node.kind) {
    case 'usualGroup':
      serializeUsualGroup(ctx, node as UsualGroupNode);
      break;
    case 'pages':
      serializePagesGroup(ctx, node as PagesNode);
      break;
    case 'page':
      serializePageGroup(ctx, node as PageNode);
      break;
    case 'columnGroup':
      serializeColumnGroup(ctx, node as ColumnGroupNode);
      break;
    case 'commandBar':
      serializeCommandBar(ctx, node as CommandBarNode);
      break;
    case 'autoCommandBar':
      serializeAutoCommandBar(ctx, node as AutoCommandBarNode);
      break;
    case 'field':
      serializeField(ctx, node as FieldNode);
      break;
    case 'decoration':
      serializeDecoration(ctx, node as DecorationNode);
      break;
    case 'button':
      serializeButtonNode(ctx, node as ButtonNode);
      break;
    case 'table':
      serializeTable(ctx, node as TableNode);
      break;
  }

  ctx.closeTag('elements');
}

function serializeUnknownElement(ctx: SerializerContext, node: UnknownElementNode): void {
  // Try to restore original XML from rawXml
  ctx.appendRawLine(tryParseStoredXml(node.rawXml, 'elements', ctx.currentIndent()));
}

// ─── Container Serialization ───

function serializeUsualGroup(ctx: SerializerContext, node: UsualGroupNode): void {
  serializeGroupType(ctx, node.group);
  if (node.representation) {
    ctx.simpleElement('representation', capitalizeFirst(node.representation));
  }
  if (node.showTitle !== undefined) ctx.simpleElement('showTitle', String(node.showTitle));
  if (node.collapsible !== undefined) ctx.simpleElement('collapsible', String(node.collapsible));
  if (node.collapsed !== undefined) ctx.simpleElement('collapsed', String(node.collapsed));
  serializeChildren(ctx, node.children);
}

function serializePagesGroup(ctx: SerializerContext, node: PagesNode): void {
  if (node.pagesRepresentation) {
    ctx.simpleElement('pagesRepresentation', capitalizeFirst(node.pagesRepresentation));
  }
  serializeChildren(ctx, node.children);
}

function serializePageGroup(ctx: SerializerContext, node: PageNode): void {
  serializeGroupType(ctx, node.group);
  if (node.picture) serializePictureRef(ctx, 'picture', node.picture);
  serializeChildren(ctx, node.children);
}

function serializeColumnGroup(ctx: SerializerContext, node: ColumnGroupNode): void {
  serializeGroupType(ctx, node.group);
  serializeChildren(ctx, node.children);
}

function serializeCommandBar(ctx: SerializerContext, node: CommandBarNode): void {
  if (node.commandSource) ctx.simpleElement('commandSource', node.commandSource);
  serializeChildren(ctx, node.children);
}

function serializeAutoCommandBar(ctx: SerializerContext, node: AutoCommandBarNode): void {
  serializeChildren(ctx, node.children);
}

// ─── Element Serialization ───

function serializeField(ctx: SerializerContext, node: FieldNode): void {
  if (node.dataPath) ctx.simpleElement('dataPath', node.dataPath);
  if (node.mask) ctx.simpleElement('mask', node.mask);
  if (node.inputHint) ctx.simpleElement('inputHint', node.inputHint);
  if (node.multiLine !== undefined) ctx.simpleElement('multiLine', String(node.multiLine));
  if (node.choiceButton !== undefined) ctx.simpleElement('choiceButton', String(node.choiceButton));
  if (node.openButton !== undefined) ctx.simpleElement('openButton', String(node.openButton));
  if (node.clearButton !== undefined) ctx.simpleElement('clearButton', String(node.clearButton));
  if (node.format) ctx.simpleElement('format', node.format);
  if (node.typeLink) ctx.simpleElement('typeLink', node.typeLink);
}

function serializeDecoration(ctx: SerializerContext, node: DecorationNode): void {
  if (node.picture) serializePictureRef(ctx, 'picture', node.picture);
  if (node.hyperlink !== undefined) ctx.simpleElement('hyperlink', String(node.hyperlink));
}

function serializeButtonNode(ctx: SerializerContext, node: ButtonNode): void {
  if (node.commandName) ctx.simpleElement('commandName', node.commandName);
  if (node.defaultButton !== undefined) ctx.simpleElement('defaultButton', String(node.defaultButton));
  if (node.picture) serializePictureRef(ctx, 'picture', node.picture);
  if (node.representation) ctx.simpleElement('representation', capitalizeFirst(node.representation));
  if (node.onlyInCommandBar !== undefined) ctx.simpleElement('onlyInCommandBar', String(node.onlyInCommandBar));
}

function serializeTable(ctx: SerializerContext, node: TableNode): void {
  if (node.dataPath) ctx.simpleElement('dataPath', node.dataPath);
  if (node.searchStringLocation) ctx.simpleElement('searchStringLocation', capitalizeFirst(node.searchStringLocation));
  if (node.rowCount !== undefined) ctx.simpleElement('rowCount', String(node.rowCount));
  if (node.selectionMode) ctx.simpleElement('selectionMode', capitalizeFirst(node.selectionMode));
  if (node.header !== undefined) ctx.simpleElement('header', String(node.header));
  if (node.footer !== undefined) ctx.simpleElement('footer', String(node.footer));
  if (node.horizontalLines !== undefined) ctx.simpleElement('horizontalLines', String(node.horizontalLines));
  if (node.verticalLines !== undefined) ctx.simpleElement('verticalLines', String(node.verticalLines));
  if (node.headerFixing) ctx.simpleElement('headerFixing', capitalizeFirst(node.headerFixing));

  // Command bar
  if (node.commandBar) {
    serializeElement(ctx, node.commandBar);
  }

  // Columns as child elements
  for (const col of node.columns) {
    serializeTableColumn(ctx, col);
  }
}

function serializeTableColumn(ctx: SerializerContext, col: TableColumn): void {
  const attrs: string[] = [`xsi:type="FormField"`];
  if (col.id.xmlId && col.id.xmlId !== '0') {
    attrs.push(`id="${escapeXml(col.id.xmlId)}"`);
  }
  attrs.push(`name="${escapeXml(col.name)}"`);

  ctx.openTag('elements', attrs);

  ctx.simpleElement('kind', 'InputField');

  serializeLocalizedString(ctx, 'title', col.caption);

  if (col.dataPath) ctx.simpleElement('dataPath', col.dataPath);
  if (col.visible !== undefined) ctx.simpleElement('visible', String(col.visible));
  if (col.readOnly !== undefined) ctx.simpleElement('readOnly', String(col.readOnly));
  if (col.width !== undefined) ctx.simpleElement('width', String(col.width));
  if (col.minWidth !== undefined) ctx.simpleElement('minWidth', String(col.minWidth));
  if (col.maxWidth !== undefined) ctx.simpleElement('maxWidth', String(col.maxWidth));
  if (col.autoMaxWidth !== undefined) ctx.simpleElement('autoMaxWidth', String(col.autoMaxWidth));
  if (col.choiceButton !== undefined) ctx.simpleElement('choiceButton', String(col.choiceButton));
  if (col.clearButton !== undefined) ctx.simpleElement('clearButton', String(col.clearButton));
  if (col.format) ctx.simpleElement('format', col.format);
  if (col.footerText) ctx.simpleElement('footerText', col.footerText);

  ctx.closeTag('elements');
}

// ─── Common Properties ───

function serializeBaseProperties(ctx: SerializerContext, node: FormNode): void {
  serializeLocalizedString(ctx, 'title', node.caption);

  if (node.visible !== undefined) ctx.simpleElement('visible', String(node.visible));
  if (node.enabled !== undefined) ctx.simpleElement('enabled', String(node.enabled));
  if (node.readOnly !== undefined) ctx.simpleElement('readOnly', String(node.readOnly));
  if (node.skipOnInput !== undefined) ctx.simpleElement('skipOnInput', String(node.skipOnInput));

  serializeLocalizedString(ctx, 'toolTip', node.toolTip);
  serializeLayoutProps(ctx, node.layout);
  serializeStyleProps(ctx, node.style);
  // Skip bindings for field/table — they serialize dataPath themselves
  if (node.kind !== 'field' && node.kind !== 'table') {
    serializeBindingProps(ctx, node.bindings);
  }
  serializeEventBindings(ctx, node.events);

  if (node.conditionalAppearance) {
    ctx.appendRawLine(tryParseStoredXml(
      node.conditionalAppearance.xml,
      'conditionalAppearance',
      ctx.currentIndent(),
    ));
  }
}

function serializeLayoutProps(ctx: SerializerContext, layout?: LayoutProps): void {
  if (!layout) return;
  if (layout.width !== undefined) ctx.simpleElement('width', String(layout.width));
  if (layout.height !== undefined) ctx.simpleElement('height', String(layout.height));
  if (layout.autoMaxWidth !== undefined) ctx.simpleElement('autoMaxWidth', String(layout.autoMaxWidth));
  if (layout.autoMaxHeight !== undefined) ctx.simpleElement('autoMaxHeight', String(layout.autoMaxHeight));
  if (layout.horizontalStretch !== undefined) ctx.simpleElement('horizontalStretch', String(layout.horizontalStretch));
  if (layout.verticalStretch !== undefined) ctx.simpleElement('verticalStretch', String(layout.verticalStretch));
  if (layout.groupInColumn !== undefined) ctx.simpleElement('groupInColumn', String(layout.groupInColumn));
  if (layout.titleLocation) ctx.simpleElement('titleLocation', capitalizeFirst(layout.titleLocation));
}

function serializeStyleProps(ctx: SerializerContext, style?: StyleProps): void {
  if (!style) return;
  if (style.font) serializeFontRef(ctx, style.font);
  if (style.textColor) serializeColorRef(ctx, 'textColor', style.textColor);
  if (style.backColor) serializeColorRef(ctx, 'backColor', style.backColor);
  if (style.borderColor) serializeColorRef(ctx, 'borderColor', style.borderColor);
}

function serializeBindingProps(ctx: SerializerContext, bindings?: BindingProps): void {
  if (!bindings) return;
  if (bindings.dataSource) ctx.simpleElement('dataSource', bindings.dataSource);
  if (bindings.dataPath) ctx.simpleElement('dataPath', bindings.dataPath);
}

function serializeEventBindings(ctx: SerializerContext, events?: EventBinding[]): void {
  if (!events || events.length === 0) return;
  for (const ev of events) {
    ctx.openTag('handlers');
    ctx.simpleElement('event', ev.event);
    if (ev.handler) ctx.simpleElement('n', ev.handler);
    ctx.closeTag('handlers');
  }
}

// ─── Form Attributes ───

function serializeFormAttribute(ctx: SerializerContext, attr: FormAttribute): void {
  const attrs: string[] = [];
  if (attr.id.xmlId && attr.id.xmlId !== '0') {
    attrs.push(`uuid="${escapeXml(attr.id.xmlId)}"`);
  }
  ctx.openTag('attributes', attrs);

  ctx.simpleElement('name', attr.name);

  if (attr.main !== undefined) ctx.simpleElement('main', String(attr.main));
  if (attr.savedData !== undefined) ctx.simpleElement('savedData', String(attr.savedData));
  if (attr.dataPath) ctx.simpleElement('dataPath', attr.dataPath);

  if (attr.valueType) {
    ctx.openTag('valueType');
    for (const t of attr.valueType.types) {
      ctx.simpleElement('types', t);
    }
    if (attr.valueType.stringLength !== undefined)
      ctx.simpleElement('stringLength', String(attr.valueType.stringLength));
    if (attr.valueType.numberLength !== undefined)
      ctx.simpleElement('numberLength', String(attr.valueType.numberLength));
    if (attr.valueType.numberPrecision !== undefined)
      ctx.simpleElement('numberPrecision', String(attr.valueType.numberPrecision));
    if (attr.valueType.dateFractions)
      ctx.simpleElement('dateFractions', capitalizeFirst(attr.valueType.dateFractions));
    ctx.closeTag('valueType');
  }

  if (attr.children) {
    for (const child of attr.children) {
      serializeFormAttribute(ctx, child);
    }
  }

  ctx.closeTag('attributes');
}

// ─── Form Commands ───

function serializeFormCommand(ctx: SerializerContext, cmd: FormCommand): void {
  const attrs: string[] = [];
  if (cmd.id.xmlId && cmd.id.xmlId !== '0') {
    attrs.push(`uuid="${escapeXml(cmd.id.xmlId)}"`);
  }
  ctx.openTag('commands', attrs);

  ctx.simpleElement('name', cmd.name);
  serializeLocalizedString(ctx, 'title', cmd.title);
  ctx.simpleElement('action', cmd.action);

  if (cmd.picture) serializePictureRef(ctx, 'picture', cmd.picture);
  serializeLocalizedString(ctx, 'toolTip', cmd.toolTip);

  if (cmd.use) ctx.simpleElement('use', capitalizeFirst(cmd.use));
  if (cmd.representation) ctx.simpleElement('representation', cmd.representation);
  if (cmd.modifiesStoredData !== undefined) ctx.simpleElement('modifiesStoredData', String(cmd.modifiesStoredData));
  if (cmd.shortcut) ctx.simpleElement('shortcut', cmd.shortcut);

  ctx.closeTag('commands');
}

// ─── Helpers ───

function serializeLocalizedString(ctx: SerializerContext, tag: string, ls?: LocalizedString): void {
  if (!ls) return;
  ctx.openTag(tag);
  ctx.simpleElement('key', 'ru');
  ctx.simpleElement('value', ls.value);
  ctx.closeTag(tag);
}

function serializeGroupType(ctx: SerializerContext, group?: GroupType): void {
  if (!group) return;
  const xmlVal = GROUP_TYPE_TO_XML[group] || capitalizeFirst(group);
  ctx.simpleElement('group', xmlVal);
}

function serializePictureRef(ctx: SerializerContext, tag: string, ref: PictureRef): void {
  ctx.openTag(tag);
  ctx.simpleElement('source', ref.source);
  if (ref.name) ctx.simpleElement('name', ref.name);
  ctx.closeTag(tag);
}

function serializeFontRef(ctx: SerializerContext, font: FontRef): void {
  ctx.openTag('font');
  if (font.name) ctx.simpleElement('name', font.name);
  if (font.size !== undefined) ctx.simpleElement('size', String(font.size));
  if (font.bold !== undefined) ctx.simpleElement('bold', String(font.bold));
  if (font.italic !== undefined) ctx.simpleElement('italic', String(font.italic));
  if (font.underline !== undefined) ctx.simpleElement('underline', String(font.underline));
  if (font.strikeout !== undefined) ctx.simpleElement('strikeout', String(font.strikeout));
  ctx.closeTag('font');
}

function serializeColorRef(ctx: SerializerContext, tag: string, color: ColorRef): void {
  ctx.openTag(tag);
  if (color.styleName) ctx.simpleElement('styleName', color.styleName);
  if (color.red !== undefined) ctx.simpleElement('red', String(color.red));
  if (color.green !== undefined) ctx.simpleElement('green', String(color.green));
  if (color.blue !== undefined) ctx.simpleElement('blue', String(color.blue));
  ctx.closeTag(tag);
}

function serializeFormRootProperties(ctx: SerializerContext, props?: import('../model/form-model').FormRootProperties): void {
  if (!props) return;
  if (props.width !== undefined) ctx.simpleElement('width', String(props.width));
  if (props.height !== undefined) ctx.simpleElement('height', String(props.height));
  if (props.windowOpeningMode) ctx.simpleElement('windowOpeningMode', props.windowOpeningMode);
  if (props.autoTitle !== undefined) ctx.simpleElement('autoTitle', String(props.autoTitle));
  if (props.autoUrl !== undefined) ctx.simpleElement('autoUrl', String(props.autoUrl));
  if (props.group) serializeGroupType(ctx, props.group);
}

function serializeChildren(ctx: SerializerContext, children: FormNode[]): void {
  for (const child of children) {
    serializeElement(ctx, child);
  }
}

function insertUnknownBlock(
  ctx: SerializerContext,
  blocks: UnknownBlock[] | undefined,
  key: string,
): void {
  if (!blocks) return;
  const block = blocks.find((b) => b.key === key);
  if (block) {
    ctx.appendRawLine(tryParseStoredXml(block.xml, key, ctx.currentIndent()));
  }
}

// ─── Serializer Context ───

class SerializerContext {
  private lines: string[] = [];
  private depth = 0;
  private indentStr: string;

  constructor(indent: string) {
    this.indentStr = indent;
  }

  currentIndent(): string {
    return this.indentStr.repeat(this.depth);
  }

  appendLine(line: string): void {
    this.lines.push(line);
  }

  appendRawLine(content: string): void {
    this.lines.push(content);
  }

  openTag(name: string, attrs?: string[]): void {
    const indent = this.currentIndent();
    if (attrs && attrs.length > 0) {
      this.lines.push(`${indent}<${name} ${attrs.join(' ')}>`);
    } else {
      this.lines.push(`${indent}<${name}>`);
    }
    this.depth++;
  }

  closeTag(name: string): void {
    this.depth--;
    const indent = this.currentIndent();
    this.lines.push(`${indent}</${name}>`);
  }

  simpleElement(name: string, value: string): void {
    const indent = this.currentIndent();
    this.lines.push(`${indent}<${name}>${escapeXml(value)}</${name}>`);
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

// ─── Utilities ───

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tryParseStoredXml(json: string, _tagName: string, _indent: string): string {
  // Stored as JSON from parser — reconstruct simple XML
  // In a production version, we'd store and restore raw XML fragments.
  // For now, insert the stored JSON as a comment for round-trip tracking.
  try {
    const data = JSON.parse(json);
    if (typeof data === 'string') return data;
    // Fallback: emit as-is
    return `${_indent}<!-- preserved: ${_tagName} -->`;
  } catch {
    return `${_indent}<!-- preserved: ${_tagName} -->`;
  }
}
