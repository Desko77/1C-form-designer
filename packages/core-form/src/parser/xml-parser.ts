/**
 * XML Parser: transforms 1C managed form XML (EDT format) into FormModel.
 * Tolerant mode: produces diagnostics instead of crashing on unknown structures.
 */

import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';
import type {
  FormModel,
  FormMeta,
  FormRoot,
  FormNode,
  FormAttribute,
  FormAttributeType,
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
  FieldType,
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
  XML_TO_MODEL_KIND,
  XML_KIND_TO_FIELD_TYPE,
  XML_KIND_TO_DECORATION_TYPE,
  XML_TO_GROUP_TYPE,
} from './xml-mapping';

export interface ParseResult {
  model: FormModel;
  diagnostics: ParseDiagnostic[];
}

export interface ParseDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
}

interface RawElement {
  [key: string]: unknown;
}

const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  commentPropName: '#comment',
  trimValues: false,
  parseTagValue: false,
  isArray: (name: string) => {
    return ['elements', 'handlers', 'attributes', 'commands', 'columns', 'usePurposes'].includes(name);
  },
};

export function parseXmlToModel(xml: string, uri?: string): ParseResult {
  const diagnostics: ParseDiagnostic[] = [];
  const parser = new XMLParser(xmlParserOptions);

  let parsed: RawElement;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    return {
      model: createEmptyModel(),
      diagnostics: [{ severity: 'error', message: `XML parse error: ${err}` }],
    };
  }

  // Find root element (mdclass:ManagedForm or ManagedForm)
  const rootKey = Object.keys(parsed).find(
    (k) => k === 'mdclass:ManagedForm' || k === 'ManagedForm' || k.endsWith(':ManagedForm'),
  );

  if (!rootKey) {
    return {
      model: createEmptyModel(),
      diagnostics: [{ severity: 'error', message: 'Root element <ManagedForm> not found' }],
    };
  }

  const rawRoot = parsed[rootKey] as RawElement;

  // Extract namespaces from attributes
  const xmlNamespaces: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawRoot)) {
    if (key.startsWith('@_xmlns:') || key === '@_xmlns') {
      const prefix = key === '@_xmlns' ? '' : key.replace('@_xmlns:', '');
      xmlNamespaces[prefix] = String(val);
    }
  }

  const meta: FormMeta = {
    origin: uri ? { uri } : undefined,
    formatting: { mode: 'preserve' },
    xmlNamespaces,
    exportFormat: 'edt',
    platformVersion: extractText(rawRoot['platformVersion']),
  };

  // Parse form name
  const formName = extractText(rawRoot['n']) || extractText(rawRoot['name']) || 'UnnamedForm';

  // Form root identity
  const formId: NodeIdentity = {
    xmlId: String(rawRoot['@_uuid'] || '0'),
    internalId: randomUUID(),
  };

  // Parse children elements
  const rawElements = ensureArray(rawRoot['elements']);
  const children: FormNode[] = [];
  let autoCommandBar: AutoCommandBarNode | undefined;

  for (const rawEl of rawElements) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const node = parseElement(rawEl as RawElement, diagnostics);
    if (node) {
      if (node.kind === 'autoCommandBar') {
        autoCommandBar = node as AutoCommandBarNode;
      } else {
        children.push(node);
      }
    }
  }

  // Parse form properties
  const formRoot: FormRoot = {
    id: formId,
    name: formName,
    caption: parseLocalizedString(rawRoot['title']),
    autoCommandBar,
    children,
    formProperties: parseFormRootProperties(rawRoot),
  };

  // Parse attributes
  const attributes = parseFormAttributes(ensureArray(rawRoot['attributes']), diagnostics);

  // Parse commands
  const commands = parseFormCommands(ensureArray(rawRoot['commands']), diagnostics);

  // Collect unknown top-level blocks
  const unknownBlocks = collectUnknownTopLevel(rawRoot, diagnostics);

  const model: FormModel = {
    version: '1.0',
    meta,
    form: formRoot,
    attributes: attributes.length > 0 ? attributes : undefined,
    commands: commands.length > 0 ? commands : undefined,
    unknownBlocks: unknownBlocks.length > 0 ? unknownBlocks : undefined,
  };

  return { model, diagnostics };
}

function createEmptyModel(): FormModel {
  return {
    version: '1.0',
    form: {
      id: { xmlId: '0', internalId: randomUUID() },
      name: 'EmptyForm',
      children: [],
    },
  };
}

// ─── Element Parsing ───

function parseElement(raw: RawElement, diagnostics: ParseDiagnostic[]): FormNode | null {
  const xsiType = String(raw['@_xsi:type'] || raw['@_type'] || '');
  const xmlKind = extractText(raw['kind']) || '';
  const id = String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = String(raw['@_name'] || '') || extractText(raw['name']) || extractText(raw['n']) || '';

  // Resolve model kind
  const typeMap = XML_TO_MODEL_KIND[xsiType];
  let modelKind: string | undefined;

  if (typeMap) {
    modelKind = typeMap[xmlKind] || typeMap['*'];
  }

  if (!modelKind) {
    // Tier 3: unknown element
    diagnostics.push({
      severity: 'info',
      message: `Unknown element type: xsi:type="${xsiType}", kind="${xmlKind}", name="${name}" — preserved as UnknownElementNode`,
    });
    return parseUnknownElement(raw, xsiType, xmlKind, id, name);
  }

  const identity: NodeIdentity = {
    xmlId: id,
    internalId: randomUUID(),
  };

  const baseProps = parseBaseProperties(raw);

  switch (modelKind) {
    case 'usualGroup':
      return parseUsualGroup(raw, identity, name, baseProps, diagnostics);
    case 'pages':
      return parsePagesGroup(raw, identity, name, baseProps, diagnostics);
    case 'page':
      return parsePageGroup(raw, identity, name, baseProps, diagnostics);
    case 'columnGroup':
      return parseColumnGroup(raw, identity, name, baseProps, diagnostics);
    case 'commandBar':
      return parseCommandBar(raw, identity, name, baseProps, diagnostics);
    case 'autoCommandBar':
      return parseAutoCommandBar(raw, identity, name, baseProps, diagnostics);
    case 'field':
      return parseField(raw, identity, name, xmlKind, baseProps, diagnostics);
    case 'decoration':
      return parseDecoration(raw, identity, name, xmlKind, baseProps);
    case 'button':
      return parseButton(raw, identity, name, baseProps);
    case 'table':
      return parseTable(raw, identity, name, baseProps, diagnostics);
    default:
      return null;
  }
}

function parseUnknownElement(
  raw: RawElement,
  xsiType: string,
  xmlKind: string,
  id: string,
  name: string,
): UnknownElementNode {
  const rawXml = JSON.stringify(raw);
  const childNodes: FormNode[] = [];

  // Try to parse children even for unknown elements
  const rawChildren = ensureArray(raw['elements']);
  for (const child of rawChildren) {
    if (child && typeof child === 'object') {
      const node = parseElement(child as RawElement, []);
      if (node) childNodes.push(node);
    }
  }

  return {
    id: { xmlId: id, internalId: randomUUID() },
    kind: 'unknown',
    name: name || `Unknown_${id}`,
    originalXsiType: xsiType,
    originalKind: xmlKind || undefined,
    rawXml,
    children: childNodes.length > 0 ? childNodes : undefined,
    ...parseBaseProperties(raw),
  };
}

// ─── Container Parsers ───

function parseUsualGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): UsualGroupNode {
  const children = parseChildElements(raw, diagnostics);
  return {
    ...base,
    id,
    kind: 'usualGroup',
    name,
    children,
    group: parseGroupType(raw['group']),
    representation: parseEnum(extractText(raw['representation']), [
      'none', 'normalSeparation', 'strongSeparation', 'weakSeparation',
    ]) as UsualGroupNode['representation'],
    showTitle: parseBool(raw['showTitle']),
    collapsible: parseBool(raw['collapsible']),
    collapsed: parseBool(raw['collapsed']),
  };
}

function parsePagesGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): PagesNode {
  const children = parseChildElements(raw, diagnostics).filter(
    (c): c is PageNode => c.kind === 'page',
  );
  return {
    ...base,
    id,
    kind: 'pages',
    name,
    children,
    pagesRepresentation: parseEnum(extractText(raw['pagesRepresentation']), [
      'none', 'tabsOnTop', 'tabsOnBottom', 'tabsOnLeft', 'tabsOnRight',
    ]) as PagesNode['pagesRepresentation'],
  };
}

function parsePageGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): PageNode {
  const children = parseChildElements(raw, diagnostics);
  return {
    ...base,
    id,
    kind: 'page',
    name,
    children,
    group: parseGroupType(raw['group']),
    picture: parsePictureRef(raw['picture']),
  };
}

function parseColumnGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): ColumnGroupNode {
  const children = parseChildElements(raw, diagnostics);
  return {
    ...base,
    id,
    kind: 'columnGroup',
    name,
    children,
    group: parseGroupType(raw['group']),
  };
}

function parseCommandBar(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): CommandBarNode {
  const children = parseChildElements(raw, diagnostics) as (ButtonNode | AutoCommandBarNode)[];
  return {
    ...base,
    id,
    kind: 'commandBar',
    name,
    children,
    commandSource: extractText(raw['commandSource']),
  };
}

function parseAutoCommandBar(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): AutoCommandBarNode {
  const children = parseChildElements(raw, diagnostics) as ButtonNode[];
  return {
    ...base,
    id,
    kind: 'autoCommandBar',
    name,
    children,
  };
}

// ─── Element Parsers ───

function parseField(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  xmlKind: string,
  base: BaseProps,
  _diagnostics: ParseDiagnostic[],
): FieldNode {
  const fieldType = (XML_KIND_TO_FIELD_TYPE[xmlKind] || 'input') as FieldType;
  return {
    ...base,
    id,
    kind: 'field',
    name,
    fieldType,
    dataPath: extractText(raw['dataPath']),
    mask: extractText(raw['mask']),
    inputHint: extractText(raw['inputHint']),
    multiLine: parseBool(raw['multiLine']),
    choiceButton: parseBool(raw['choiceButton']),
    openButton: parseBool(raw['openButton']),
    clearButton: parseBool(raw['clearButton']),
    format: extractText(raw['format']),
    typeLink: extractText(raw['typeLink']),
  };
}

function parseDecoration(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  xmlKind: string,
  base: BaseProps,
): DecorationNode {
  return {
    ...base,
    id,
    kind: 'decoration',
    name,
    decorationType: XML_KIND_TO_DECORATION_TYPE[xmlKind] || 'label',
    picture: parsePictureRef(raw['picture']),
    hyperlink: parseBool(raw['hyperlink']),
  };
}

function parseButton(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
): ButtonNode {
  return {
    ...base,
    id,
    kind: 'button',
    name,
    commandName: extractText(raw['commandName']),
    defaultButton: parseBool(raw['defaultButton']),
    picture: parsePictureRef(raw['picture']),
    representation: parseEnum(extractText(raw['representation']), [
      'auto', 'text', 'picture', 'textPicture',
    ]) as ButtonNode['representation'],
    onlyInCommandBar: parseBool(raw['onlyInCommandBar']),
  };
}

function parseTable(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): TableNode {
  // Table children are columns in XML, but can also contain nested elements
  const rawElements = ensureArray(raw['elements']);
  const columns: TableColumn[] = [];
  let commandBar: CommandBarNode | undefined;

  for (const rawEl of rawElements) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const el = rawEl as RawElement;
    const xsiType = String(el['@_xsi:type'] || '');
    const kind = extractText(el['kind']) || '';

    if (xsiType === 'FormGroup' && (kind === 'CommandBar' || kind === 'AutoCommandBar')) {
      const node = parseElement(el, diagnostics);
      if (node && node.kind === 'commandBar') {
        commandBar = node as CommandBarNode;
      }
    } else {
      // Table columns are FormField elements inside a table
      columns.push(parseTableColumn(el));
    }
  }

  // Also check for dedicated 'columns' element
  const rawColumns = ensureArray(raw['columns']);
  for (const rawCol of rawColumns) {
    if (rawCol && typeof rawCol === 'object') {
      columns.push(parseTableColumn(rawCol as RawElement));
    }
  }

  return {
    ...base,
    id,
    kind: 'table',
    name,
    dataPath: extractText(raw['dataPath']),
    columns,
    commandBar,
    searchStringLocation: parseEnum(extractText(raw['searchStringLocation']), [
      'none', 'top', 'bottom',
    ]) as TableNode['searchStringLocation'],
    rowCount: parseNumber(raw['rowCount']),
    selectionMode: parseEnum(extractText(raw['selectionMode']), ['single', 'multi']) as TableNode['selectionMode'],
    header: parseBool(raw['header']),
    footer: parseBool(raw['footer']),
    horizontalLines: parseBool(raw['horizontalLines']),
    verticalLines: parseBool(raw['verticalLines']),
    headerFixing: parseEnum(extractText(raw['headerFixing']), [
      'none', 'fixHeader',
    ]) as TableNode['headerFixing'],
  };
}

function parseTableColumn(raw: RawElement): TableColumn {
  const id = String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = String(raw['@_name'] || '') || extractText(raw['name']) || extractText(raw['n']) || '';
  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    caption: parseLocalizedString(raw['title']),
    dataPath: extractText(raw['dataPath']),
    visible: parseBool(raw['visible']),
    readOnly: parseBool(raw['readOnly']),
    width: parseNumber(raw['width']),
    minWidth: parseNumber(raw['minWidth']),
    maxWidth: parseNumber(raw['maxWidth']),
    autoMaxWidth: parseBool(raw['autoMaxWidth']),
    cellType: extractText(raw['cellType']),
    choiceButton: parseBool(raw['choiceButton']),
    clearButton: parseBool(raw['clearButton']),
    format: extractText(raw['format']),
    footerText: extractText(raw['footerText']),
  };
}

// ─── Base Properties ───

interface BaseProps {
  caption?: LocalizedString;
  visible?: boolean;
  enabled?: boolean;
  readOnly?: boolean;
  skipOnInput?: boolean;
  toolTip?: LocalizedString;
  layout?: LayoutProps;
  style?: StyleProps;
  bindings?: BindingProps;
  events?: EventBinding[];
  conditionalAppearance?: UnknownBlock;
}

function parseBaseProperties(raw: RawElement): BaseProps {
  const result: BaseProps = {};

  result.caption = parseLocalizedString(raw['title']);
  result.visible = parseBool(raw['visible']);
  result.enabled = parseBool(raw['enabled']);
  result.readOnly = parseBool(raw['readOnly']);
  result.skipOnInput = parseBool(raw['skipOnInput']);
  result.toolTip = parseLocalizedString(raw['toolTip']);
  result.layout = parseLayoutProps(raw);
  result.style = parseStyleProps(raw);
  result.bindings = parseBindingProps(raw);
  result.events = parseEventBindings(ensureArray(raw['handlers']));

  if (raw['conditionalAppearance']) {
    result.conditionalAppearance = {
      key: 'conditionalAppearance',
      xml: JSON.stringify(raw['conditionalAppearance']),
    };
  }

  // Remove undefined values
  for (const key of Object.keys(result) as (keyof BaseProps)[]) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }

  return result;
}

function parseLayoutProps(raw: RawElement): LayoutProps | undefined {
  const layout: LayoutProps = {};
  let hasAny = false;

  const w = parseNumber(raw['width']);
  if (w !== undefined) { layout.width = w; hasAny = true; }

  const h = parseNumber(raw['height']);
  if (h !== undefined) { layout.height = h; hasAny = true; }

  const amw = parseBool(raw['autoMaxWidth']);
  if (amw !== undefined) { layout.autoMaxWidth = amw; hasAny = true; }

  const amh = parseBool(raw['autoMaxHeight']);
  if (amh !== undefined) { layout.autoMaxHeight = amh; hasAny = true; }

  const hs = parseBool(raw['horizontalStretch']);
  if (hs !== undefined) { layout.horizontalStretch = hs; hasAny = true; }

  const vs = parseBool(raw['verticalStretch']);
  if (vs !== undefined) { layout.verticalStretch = vs; hasAny = true; }

  const gc = parseNumber(raw['groupInColumn']);
  if (gc !== undefined) { layout.groupInColumn = gc; hasAny = true; }

  const tl = parseEnum(extractText(raw['titleLocation']), [
    'auto', 'left', 'top', 'bottom', 'right', 'none',
  ]) as LayoutProps['titleLocation'];
  if (tl) { layout.titleLocation = tl; hasAny = true; }

  return hasAny ? layout : undefined;
}

function parseStyleProps(raw: RawElement): StyleProps | undefined {
  const style: StyleProps = {};
  let hasAny = false;

  const font = parseFontRef(raw['font']);
  if (font) { style.font = font; hasAny = true; }

  const tc = parseColorRef(raw['textColor']);
  if (tc) { style.textColor = tc; hasAny = true; }

  const bc = parseColorRef(raw['backColor']);
  if (bc) { style.backColor = bc; hasAny = true; }

  const brc = parseColorRef(raw['borderColor']);
  if (brc) { style.borderColor = brc; hasAny = true; }

  return hasAny ? style : undefined;
}

function parseBindingProps(raw: RawElement): BindingProps | undefined {
  const ds = extractText(raw['dataSource']);
  const dp = extractText(raw['dataPath']);
  if (!ds && !dp) return undefined;
  return { dataSource: ds, dataPath: dp };
}

function parseEventBindings(handlers: unknown[]): EventBinding[] | undefined {
  if (!handlers || handlers.length === 0) return undefined;
  const events: EventBinding[] = [];
  for (const h of handlers) {
    if (!h || typeof h !== 'object') continue;
    const raw = h as RawElement;
    const event = extractText(raw['event']);
    if (!event) continue;
    events.push({
      event,
      handler: extractText(raw['n']) || extractText(raw['name']) || undefined,
    });
  }
  return events.length > 0 ? events : undefined;
}

// ─── Form Attributes ───

function parseFormAttributes(rawAttrs: unknown[], diagnostics: ParseDiagnostic[]): FormAttribute[] {
  const result: FormAttribute[] = [];
  for (const raw of rawAttrs) {
    if (!raw || typeof raw !== 'object') continue;
    const attr = parseFormAttribute(raw as RawElement, diagnostics);
    if (attr) result.push(attr);
  }
  return result;
}

function parseFormAttribute(raw: RawElement, diagnostics: ParseDiagnostic[]): FormAttribute | null {
  const id = String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = String(raw['@_name'] || '') || extractText(raw['name']) || extractText(raw['n']) || '';
  if (!name) return null;

  const children = parseFormAttributes(ensureArray(raw['attributes']), diagnostics);

  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    valueType: parseValueType(raw['valueType']),
    main: parseBool(raw['main']),
    savedData: parseBool(raw['savedData']),
    dataPath: extractText(raw['dataPath']),
    children: children.length > 0 ? children : undefined,
  };
}

function parseValueType(raw: unknown): FormAttributeType | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as RawElement;

  const types: string[] = [];
  const rawTypes = ensureArray(obj['types'] || obj['type']);
  for (const t of rawTypes) {
    const s = typeof t === 'string' ? t : extractText(t as RawElement);
    if (s) types.push(s);
  }

  if (types.length === 0) return undefined;

  return {
    types,
    stringLength: parseNumber(obj['stringLength']),
    numberLength: parseNumber(obj['numberLength']),
    numberPrecision: parseNumber(obj['numberPrecision']),
    dateFractions: parseEnum(extractText(obj['dateFractions']), [
      'date', 'time', 'dateTime',
    ]) as FormAttributeType['dateFractions'],
  };
}

// ─── Form Commands ───

function parseFormCommands(rawCmds: unknown[], diagnostics: ParseDiagnostic[]): FormCommand[] {
  const result: FormCommand[] = [];
  for (const raw of rawCmds) {
    if (!raw || typeof raw !== 'object') continue;
    const cmd = parseFormCommand(raw as RawElement, diagnostics);
    if (cmd) result.push(cmd);
  }
  return result;
}

function parseFormCommand(raw: RawElement, _diagnostics: ParseDiagnostic[]): FormCommand | null {
  const id = String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = String(raw['@_name'] || '') || extractText(raw['name']) || extractText(raw['n']) || '';
  const action = extractText(raw['action']) || '';
  if (!name) return null;

  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    title: parseLocalizedString(raw['title']),
    action,
    picture: parsePictureRef(raw['picture']),
    toolTip: parseLocalizedString(raw['toolTip']),
    use: parseEnum(extractText(raw['use']), ['auto', 'always', 'never']) as FormCommand['use'],
    representation: extractText(raw['representation']),
    modifiesStoredData: parseBool(raw['modifiesStoredData']),
    shortcut: extractText(raw['shortcut']),
  };
}

// ─── Form Root Properties ───

function parseFormRootProperties(raw: RawElement): import('../model/form-model').FormRootProperties | undefined {
  const props: import('../model/form-model').FormRootProperties = {};
  let hasAny = false;

  const w = parseNumber(raw['width']);
  if (w !== undefined) { props.width = w; hasAny = true; }

  const h = parseNumber(raw['height']);
  if (h !== undefined) { props.height = h; hasAny = true; }

  const wom = parseEnum(extractText(raw['windowOpeningMode']), [
    'LockOwnerWindow', 'LockWholeInterface', 'Independent',
  ]) as import('../model/form-model').FormRootProperties['windowOpeningMode'];
  if (wom) { props.windowOpeningMode = wom; hasAny = true; }

  const at = parseBool(raw['autoTitle']);
  if (at !== undefined) { props.autoTitle = at; hasAny = true; }

  const au = parseBool(raw['autoUrl']);
  if (au !== undefined) { props.autoUrl = au; hasAny = true; }

  const g = parseGroupType(raw['group']);
  if (g) { props.group = g; hasAny = true; }

  return hasAny ? props : undefined;
}

// ─── Unknown Top-Level Blocks ───

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'elements', 'attributes', 'commands', 'parameters', 'producedTypes',
  'n', 'name', 'title', 'usePurposes', 'width', 'height',
  'windowOpeningMode', 'autoTitle', 'autoUrl', 'group',
  'platformVersion', 'commandInterface',
]);

function collectUnknownTopLevel(raw: RawElement, _diagnostics: ParseDiagnostic[]): UnknownBlock[] {
  const blocks: UnknownBlock[] = [];
  let position = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (key.startsWith('@_') || key.startsWith('#')) continue;
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      blocks.push({
        key,
        xml: JSON.stringify(val),
        position: position++,
      });
    }
  }
  return blocks;
}

// ─── Child Elements ───

function parseChildElements(raw: RawElement, diagnostics: ParseDiagnostic[]): FormNode[] {
  const rawElements = ensureArray(raw['elements']);
  const children: FormNode[] = [];
  for (const rawEl of rawElements) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const node = parseElement(rawEl as RawElement, diagnostics);
    if (node) children.push(node);
  }
  return children;
}

// ─── Utility Helpers ───

function extractText(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    // Handle <value>...</value> pattern
    if ('value' in obj) return extractText(obj['value']);
    if ('#text' in obj) return String(obj['#text']);
  }
  return undefined;
}

function parseLocalizedString(val: unknown): LocalizedString | undefined {
  if (!val) return undefined;

  if (typeof val === 'string') {
    return { value: val };
  }

  if (typeof val === 'object') {
    const obj = val as RawElement;

    // Pattern: <title><key>ru</key><value>Text</value></title>
    if ('key' in obj && 'value' in obj) {
      const lang = extractText(obj['key']) || 'ru';
      const text = extractText(obj['value']) || '';
      return {
        value: text,
        translations: { [lang]: text },
      };
    }

    // Pattern: <title>Simple text</title>
    if ('#text' in obj) {
      return { value: String(obj['#text']) };
    }

    // Pattern: array of {key, value}
    if (Array.isArray(val)) {
      const translations: Record<string, string> = {};
      let firstValue = '';
      for (const item of val) {
        if (item && typeof item === 'object') {
          const k = extractText((item as RawElement)['key']) || 'ru';
          const v = extractText((item as RawElement)['value']) || '';
          translations[k] = v;
          if (!firstValue) firstValue = v;
        }
      }
      if (firstValue) {
        return { value: firstValue, translations };
      }
    }

    // Simple value
    const text = extractText(obj['value']) || extractText(val);
    if (text) return { value: text };
  }

  return undefined;
}

function parseBool(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined;
}

function parseNumber(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function parseEnum<T extends string>(val: string | undefined, allowed: T[]): T | undefined {
  if (!val) return undefined;
  // Case-insensitive match
  const lower = val.toLowerCase();
  return allowed.find((a) => a.toLowerCase() === lower);
}

function parseGroupType(val: unknown): GroupType | undefined {
  const text = extractText(val);
  if (!text) return undefined;
  const mapped = XML_TO_GROUP_TYPE[text];
  if (mapped) return mapped as GroupType;
  // Try direct match
  return parseEnum(text, [
    'vertical', 'horizontal', 'horizontalIfPossible',
    'alwaysHorizontal', 'columnsLikeInList', 'indentedColumnsLikeInList',
  ]) as GroupType | undefined;
}

function parsePictureRef(val: unknown): PictureRef | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as RawElement;
  const source = extractText(obj['source']) || extractText(obj['value']) || extractText(val);
  if (!source) return undefined;
  return { source, name: extractText(obj['name']) };
}

function parseFontRef(val: unknown): FontRef | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as RawElement;
  const font: FontRef = {};
  let hasAny = false;

  const name = extractText(obj['name']) || extractText(obj['faceName']);
  if (name) { font.name = name; hasAny = true; }

  const size = parseNumber(obj['size'] || obj['height']);
  if (size !== undefined) { font.size = size; hasAny = true; }

  const bold = parseBool(obj['bold']);
  if (bold !== undefined) { font.bold = bold; hasAny = true; }

  const italic = parseBool(obj['italic']);
  if (italic !== undefined) { font.italic = italic; hasAny = true; }

  const underline = parseBool(obj['underline']);
  if (underline !== undefined) { font.underline = underline; hasAny = true; }

  const strikeout = parseBool(obj['strikeout']);
  if (strikeout !== undefined) { font.strikeout = strikeout; hasAny = true; }

  return hasAny ? font : undefined;
}

function parseColorRef(val: unknown): ColorRef | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as RawElement;
  const color: ColorRef = {};
  let hasAny = false;

  const styleName = extractText(obj['styleName']);
  if (styleName) { color.styleName = styleName; hasAny = true; }

  const red = parseNumber(obj['red'] || obj['r']);
  if (red !== undefined) { color.red = red; hasAny = true; }

  const green = parseNumber(obj['green'] || obj['g']);
  if (green !== undefined) { color.green = green; hasAny = true; }

  const blue = parseNumber(obj['blue'] || obj['b']);
  if (blue !== undefined) { color.blue = blue; hasAny = true; }

  return hasAny ? color : undefined;
}

function ensureArray(val: unknown): unknown[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}
