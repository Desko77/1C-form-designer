/**
 * Serializer for Form.form (EDT workspace format).
 *
 * Produces XML with:
 * - Root: <form:Form xmlns:form="..." xmlns:xsi="..." ...>
 * - Elements: <items xsi:type="form:FormField"> with <type>, <name>, <id> as children
 * - DataPath: <dataPath xsi:type="form:DataPath"><segments>value</segments></dataPath>
 * - Commands: <formCommands>
 * - Restored extendedTooltip, contextMenu, extInfo from preservedXml
 */

import type {
  FormModel,
  FormNode,
  FormAttribute,
  FormCommand,
  UnknownBlock,
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
import { KNOWN_NAMESPACES } from '../parser/xml-mapping';
import { FIELD_TYPE_TO_XML_KIND, DECORATION_TYPE_TO_XML_KIND } from '../parser/xml-mapping';
import { MODEL_TO_FORM_FORM_KIND } from '../parser/form-form-mapping';
import {
  SerializerContext,
  escapeXml,
  capitalizeFirst,
  tryParseStoredXml,
  serializeLocalizedString,
  serializeGroupType,
  serializePictureRef,
  serializeLayoutProps,
  serializeStyleProps,
} from './serializer-utils';
import type { SerializeOptions } from './serializer-utils';

const DEFAULT_OPTIONS: Required<SerializeOptions> = {
  indent: '  ',
  mode: 'preserve',
};

export function serializeModelToFormForm(model: FormModel, options?: SerializeOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ctx = new SerializerContext(opts.indent);

  ctx.appendLine('<?xml version="1.0" encoding="UTF-8"?>');

  // Build root element attributes
  const rootAttrs: string[] = [];

  // Namespaces — ensure form and xsi are present
  const ns = model.meta?.xmlNamespaces || {};
  const hasForm = Object.values(ns).includes(KNOWN_NAMESPACES.form);
  const hasXsi = Object.values(ns).includes(KNOWN_NAMESPACES.xsi);

  if (!hasForm) rootAttrs.push(`xmlns:form="${KNOWN_NAMESPACES.form}"`);
  if (!hasXsi) rootAttrs.push(`xmlns:xsi="${KNOWN_NAMESPACES.xsi}"`);

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

  const rootTag = 'form:Form';
  ctx.openTag(rootTag, rootAttrs);

  // producedTypes — insert unknown block if present
  insertUnknownBlock(ctx, model.unknownBlocks, 'producedTypes');

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

  // AutoCommandBar (as separate tag)
  if (model.form.autoCommandBar) {
    serializeAutoCommandBarTag(ctx, model.form.autoCommandBar);
  }

  // Elements (items)
  for (const child of model.form.children) {
    serializeItem(ctx, child);
  }

  // Commands (formCommands)
  if (model.commands && model.commands.length > 0) {
    for (const cmd of model.commands) {
      serializeFormCommand(ctx, cmd);
    }
  }

  // Root-level preserved XML
  if (model.form.preservedXml) {
    for (const [key, json] of Object.entries(model.form.preservedXml)) {
      if (key !== 'handlers' && key !== 'extInfo' && key !== 'commandInterface') continue;
      ctx.appendRawLine(tryParseStoredXml(json, key, ctx.currentIndent()));
    }
  }

  // Remaining unknown top-level blocks
  if (model.unknownBlocks) {
    for (const block of model.unknownBlocks) {
      if (['producedTypes', 'usePurposes'].includes(block.key)) continue;
      ctx.appendRawLine(tryParseStoredXml(block.xml, block.key, ctx.currentIndent()));
    }
  }

  ctx.closeTag(rootTag);

  return ctx.toString();
}

// ─── Item Serialization ───

function serializeItem(ctx: SerializerContext, node: FormNode): void {
  if (node.kind === 'unknown') {
    serializeUnknownItem(ctx, node as UnknownElementNode);
    return;
  }

  const mapping = MODEL_TO_FORM_FORM_KIND[node.kind];
  if (!mapping) return;

  const attrs: string[] = [`xsi:type="${mapping.xsiType}"`];
  ctx.openTag('items', attrs);

  // Name as child element
  ctx.simpleElement('name', node.name);

  // ID as child element
  if (node.id.xmlId && node.id.xmlId !== '0') {
    ctx.simpleElement('id', node.id.xmlId);
  }

  // Type element (equivalent of <kind> in mdclass)
  if (mapping.type) {
    ctx.simpleElement('type', mapping.type);
  } else if (node.kind === 'field') {
    const fieldNode = node as FieldNode;
    const xmlKind = FIELD_TYPE_TO_XML_KIND[fieldNode.fieldType];
    if (xmlKind) ctx.simpleElement('type', xmlKind);
  } else if (node.kind === 'decoration') {
    const decNode = node as DecorationNode;
    const xmlKind = DECORATION_TYPE_TO_XML_KIND[decNode.decorationType];
    if (xmlKind) ctx.simpleElement('type', xmlKind);
  }

  // Common properties
  serializeFormFormBaseProperties(ctx, node);

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
      serializeAutoCommandBarItems(ctx, node as AutoCommandBarNode);
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

  // Preserved XML (extendedTooltip, contextMenu, extInfo)
  serializePreservedXml(ctx, node.preservedXml);

  ctx.closeTag('items');
}

function serializeUnknownItem(ctx: SerializerContext, node: UnknownElementNode): void {
  ctx.appendRawLine(tryParseStoredXml(node.rawXml, 'items', ctx.currentIndent()));
}

// ─── Base Properties ───

function serializeFormFormBaseProperties(ctx: SerializerContext, node: FormNode): void {
  serializeLocalizedString(ctx, 'title', node.caption);

  if (node.visible !== undefined) ctx.simpleElement('visible', String(node.visible));
  if (node.enabled !== undefined) ctx.simpleElement('enabled', String(node.enabled));
  if (node.readOnly !== undefined) ctx.simpleElement('readOnly', String(node.readOnly));
  if (node.skipOnInput !== undefined) ctx.simpleElement('skipOnInput', String(node.skipOnInput));

  serializeLocalizedString(ctx, 'toolTip', node.toolTip);
  serializeLayoutProps(ctx, node.layout);
  serializeStyleProps(ctx, node.style);

  // Events with <name> instead of <n>
  if (node.events && node.events.length > 0) {
    for (const ev of node.events) {
      ctx.openTag('handlers');
      ctx.simpleElement('event', ev.event);
      if (ev.handler) ctx.simpleElement('name', ev.handler);
      ctx.closeTag('handlers');
    }
  }

  if (node.conditionalAppearance) {
    ctx.appendRawLine(tryParseStoredXml(
      node.conditionalAppearance.xml,
      'conditionalAppearance',
      ctx.currentIndent(),
    ));
  }
}

// ─── DataPath serialization ───

function serializeDataPath(ctx: SerializerContext, dataPath?: string): void {
  if (!dataPath) return;
  ctx.openTag('dataPath', ['xsi:type="form:DataPath"']);
  ctx.simpleElement('segments', dataPath);
  ctx.closeTag('dataPath');
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
  serializeChildItems(ctx, node.children);
}

function serializePagesGroup(ctx: SerializerContext, node: PagesNode): void {
  if (node.pagesRepresentation) {
    ctx.simpleElement('pagesRepresentation', capitalizeFirst(node.pagesRepresentation));
  }
  serializeChildItems(ctx, node.children);
}

function serializePageGroup(ctx: SerializerContext, node: PageNode): void {
  serializeGroupType(ctx, node.group);
  if (node.picture) serializePictureRef(ctx, 'picture', node.picture);
  serializeChildItems(ctx, node.children);
}

function serializeColumnGroup(ctx: SerializerContext, node: ColumnGroupNode): void {
  serializeGroupType(ctx, node.group);
  serializeChildItems(ctx, node.children);
}

function serializeCommandBar(ctx: SerializerContext, node: CommandBarNode): void {
  if (node.commandSource) ctx.simpleElement('commandSource', node.commandSource);
  serializeChildItems(ctx, node.children);
}

function serializeAutoCommandBarItems(ctx: SerializerContext, node: AutoCommandBarNode): void {
  serializeChildItems(ctx, node.children);
}

function serializeAutoCommandBarTag(ctx: SerializerContext, node: AutoCommandBarNode): void {
  ctx.openTag('autoCommandBar');
  ctx.simpleElement('name', node.name);
  if (node.id.xmlId && node.id.xmlId !== '0') {
    ctx.simpleElement('id', node.id.xmlId);
  }
  serializeFormFormBaseProperties(ctx, node);
  serializeChildItems(ctx, node.children);
  serializePreservedXml(ctx, node.preservedXml);
  ctx.closeTag('autoCommandBar');
}

// ─── Element Serialization ───

function serializeField(ctx: SerializerContext, node: FieldNode): void {
  serializeDataPath(ctx, node.dataPath);
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
  serializeDataPath(ctx, node.dataPath);
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
    serializeItem(ctx, node.commandBar);
  }

  // Columns as items
  for (const col of node.columns) {
    serializeTableColumn(ctx, col);
  }
}

function serializeTableColumn(ctx: SerializerContext, col: TableColumn): void {
  const attrs: string[] = ['xsi:type="form:FormField"'];
  ctx.openTag('items', attrs);

  ctx.simpleElement('name', col.name);
  if (col.id.xmlId && col.id.xmlId !== '0') {
    ctx.simpleElement('id', col.id.xmlId);
  }
  ctx.simpleElement('type', 'InputField');

  serializeLocalizedString(ctx, 'title', col.caption);

  serializeDataPath(ctx, col.dataPath);
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

  ctx.closeTag('items');
}

// ─── Helper Functions ───

function serializeChildItems(ctx: SerializerContext, children: FormNode[]): void {
  for (const child of children) {
    serializeItem(ctx, child);
  }
}

function serializePreservedXml(ctx: SerializerContext, preserved?: Record<string, string>): void {
  if (!preserved) return;
  for (const [key, json] of Object.entries(preserved)) {
    ctx.appendRawLine(tryParseStoredXml(json, key, ctx.currentIndent()));
  }
}

// ─── Form Attributes ───

function serializeFormAttribute(ctx: SerializerContext, attr: FormAttribute): void {
  ctx.openTag('attributes');

  ctx.simpleElement('name', attr.name);
  if (attr.id.xmlId && attr.id.xmlId !== '0') {
    ctx.simpleElement('id', attr.id.xmlId);
  }

  if (attr.main !== undefined) ctx.simpleElement('main', String(attr.main));
  if (attr.savedData !== undefined) ctx.simpleElement('savedData', String(attr.savedData));
  if (attr.dataPath) {
    serializeDataPath(ctx, attr.dataPath);
  }

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
  ctx.openTag('formCommands');

  ctx.simpleElement('name', cmd.name);
  if (cmd.id.xmlId && cmd.id.xmlId !== '0') {
    ctx.simpleElement('id', cmd.id.xmlId);
  }

  serializeLocalizedString(ctx, 'title', cmd.title);

  // Action: always serialize structurally to ensure round-trip correctness
  if (cmd.action) {
    ctx.openTag('action', ['xsi:type="form:FormCommandHandlerContainer"']);
    ctx.openTag('handler');
    ctx.simpleElement('name', cmd.action);
    ctx.closeTag('handler');
    ctx.closeTag('action');
  }

  if (cmd.picture) serializePictureRef(ctx, 'picture', cmd.picture);
  serializeLocalizedString(ctx, 'toolTip', cmd.toolTip);

  if (cmd.use) ctx.simpleElement('use', capitalizeFirst(cmd.use));
  if (cmd.representation) ctx.simpleElement('representation', cmd.representation);
  if (cmd.modifiesStoredData !== undefined) ctx.simpleElement('modifiesStoredData', String(cmd.modifiesStoredData));
  if (cmd.shortcut) ctx.simpleElement('shortcut', cmd.shortcut);

  ctx.closeTag('formCommands');
}

// ─── Form Root Properties ───

function serializeFormRootProperties(ctx: SerializerContext, props?: import('../model/form-model').FormRootProperties): void {
  if (!props) return;
  if (props.width !== undefined) ctx.simpleElement('width', String(props.width));
  if (props.height !== undefined) ctx.simpleElement('height', String(props.height));
  if (props.windowOpeningMode) ctx.simpleElement('windowOpeningMode', props.windowOpeningMode);
  if (props.autoTitle !== undefined) ctx.simpleElement('autoTitle', String(props.autoTitle));
  if (props.autoUrl !== undefined) ctx.simpleElement('autoUrl', String(props.autoUrl));
  if (props.group) serializeGroupType(ctx, props.group);
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
