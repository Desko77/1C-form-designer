/**
 * Parser for Form.form (EDT workspace format).
 *
 * Key differences from mdclass format:
 * - Root: <form:Form> (not <mdclass:ManagedForm>)
 * - Elements container: <items> (not <elements>)
 * - Type tag: <type> (not <kind>)
 * - Name/ID: child elements <name>, <id> (not XML attributes)
 * - DataPath: <dataPath xsi:type="form:DataPath"><segments>value</segments></dataPath>
 * - Handlers: <handlers><event>…</event><name>handler</name></handlers>
 * - Commands: <formCommands> (not <commands>)
 * - Action: complex <action xsi:type="form:FormCommandHandlerContainer">
 * - AutoCommandBar: separate <autoCommandBar> tag
 * - Nested extendedTooltip, contextMenu, extInfo → preserved in preservedXml
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
  NodeIdentity,
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
import { XML_KIND_TO_FIELD_TYPE, XML_KIND_TO_DECORATION_TYPE } from './xml-mapping';
import { FORM_FORM_TO_MODEL_KIND } from './form-form-mapping';
import {
  extractText,
  parseBool,
  parseNumber,
  parseEnum,
  ensureArray,
  parseLocalizedString,
  parsePictureRef,
  parseGroupType,
  parseLayoutProps,
  parseStyleProps,
} from './parser-utils';
import type { RawElement, ParseDiagnostic, BaseProps } from './parser-utils';
import type { ParseResult } from './parser-utils';

const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: false,
  commentPropName: '#comment',
  trimValues: false,
  parseTagValue: false,
  isArray: (name: string) => {
    return [
      'items', 'handlers', 'attributes', 'formCommands',
      'columns', 'usePurposes', 'autoCommandBar',
    ].includes(name);
  },
};

export function parseFormFormToModel(xml: string, uri?: string): ParseResult {
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

  // Find root element: form:Form
  const rootKey = Object.keys(parsed).find(
    (k) => k === 'form:Form' || k.endsWith(':Form'),
  );

  if (!rootKey) {
    return {
      model: createEmptyModel(),
      diagnostics: [{ severity: 'error', message: 'Root element <form:Form> not found' }],
    };
  }

  const rawRoot = parsed[rootKey] as RawElement;

  // Extract namespaces
  const xmlNamespaces: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawRoot)) {
    if (key.startsWith('@_xmlns:') || key === '@_xmlns') {
      const prefix = key === '@_xmlns' ? '' : key.replace('@_xmlns:', '');
      xmlNamespaces[prefix] = String(val);
    }
  }

  // Derive form name from URI (Form.form files don't embed form name in XML)
  let formName = 'UnnamedForm';
  if (uri) {
    const match = uri.match(/[/\\]([^/\\]+)[/\\]Forms?[/\\]([^/\\]+)[/\\]/i);
    if (match) {
      formName = match[2];
    } else {
      // Fallback: use parent directory name
      const segments = uri.replace(/\\/g, '/').split('/');
      const formIdx = segments.findIndex((s) => s === 'Form.form');
      if (formIdx > 0) {
        formName = segments[formIdx - 1];
      }
    }
  }

  const meta: FormMeta = {
    origin: uri ? { uri } : undefined,
    formatting: { mode: 'preserve' },
    xmlNamespaces,
    exportFormat: 'edt-form',
    platformVersion: extractText(rawRoot['platformVersion']),
  };

  const formId: NodeIdentity = {
    xmlId: String(rawRoot['@_uuid'] || '0'),
    internalId: randomUUID(),
  };

  // Parse children (items)
  const rawItems = ensureArray(rawRoot['items']);
  const children: FormNode[] = [];
  let autoCommandBar: AutoCommandBarNode | undefined;

  for (const rawEl of rawItems) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const node = parseItem(rawEl as RawElement, diagnostics);
    if (node) {
      if (node.kind === 'autoCommandBar') {
        autoCommandBar = node as AutoCommandBarNode;
      } else {
        children.push(node);
      }
    }
  }

  // Also check for dedicated <autoCommandBar> tag
  const rawAutoCmd = rawRoot['autoCommandBar'];
  if (rawAutoCmd && !autoCommandBar) {
    const acRaw = Array.isArray(rawAutoCmd) ? rawAutoCmd[0] : rawAutoCmd;
    if (acRaw && typeof acRaw === 'object') {
      const acNode = parseAutoCommandBarItem(acRaw as RawElement, diagnostics);
      if (acNode) autoCommandBar = acNode;
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

  // Preserve root-level handlers and extInfo
  const rootPreserved: Record<string, string> = {};
  for (const preserveKey of ['handlers', 'extInfo', 'commandInterface']) {
    if (rawRoot[preserveKey]) {
      rootPreserved[preserveKey] = JSON.stringify(rawRoot[preserveKey]);
    }
  }
  if (Object.keys(rootPreserved).length > 0) {
    formRoot.preservedXml = rootPreserved;
  }

  // Parse attributes
  const attributes = parseFormAttributes(ensureArray(rawRoot['attributes']), diagnostics);

  // Parse commands (formCommands in Form.form)
  const commands = parseFormCommands(ensureArray(rawRoot['formCommands']), diagnostics);

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

// ─── Item Parsing ───

function parseItem(raw: RawElement, diagnostics: ParseDiagnostic[]): FormNode | null {
  const xsiType = String(raw['@_xsi:type'] || '');
  const typeVal = extractText(raw['type']) || '';
  const id = extractText(raw['id']) || String(raw['@_id'] || '0');
  const name = extractText(raw['name']) || '';

  // Resolve model kind
  const typeMap = FORM_FORM_TO_MODEL_KIND[xsiType];
  let modelKind: string | undefined;

  if (typeMap) {
    modelKind = typeMap[typeVal] || typeMap['*'];
  }

  if (!modelKind) {
    diagnostics.push({
      severity: 'info',
      message: `Unknown element type: xsi:type="${xsiType}", type="${typeVal}", name="${name}" — preserved as UnknownElementNode`,
    });
    return parseUnknownItem(raw, xsiType, typeVal, id, name);
  }

  const identity: NodeIdentity = {
    xmlId: id,
    internalId: randomUUID(),
  };

  const baseProps = parseBaseProps(raw);

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
      return parseAutoCommandBarNode(raw, identity, name, baseProps, diagnostics);
    case 'field':
      return parseField(raw, identity, name, typeVal, baseProps);
    case 'decoration':
      return parseDecoration(raw, identity, name, typeVal, baseProps);
    case 'button':
      return parseButton(raw, identity, name, baseProps);
    case 'table':
      return parseTable(raw, identity, name, baseProps, diagnostics);
    default:
      return null;
  }
}

function parseUnknownItem(
  raw: RawElement,
  xsiType: string,
  typeVal: string,
  id: string,
  name: string,
): UnknownElementNode {
  const rawXml = JSON.stringify(raw);
  const childNodes: FormNode[] = [];

  const rawChildren = ensureArray(raw['items']);
  for (const child of rawChildren) {
    if (child && typeof child === 'object') {
      const node = parseItem(child as RawElement, []);
      if (node) childNodes.push(node);
    }
  }

  return {
    id: { xmlId: id, internalId: randomUUID() },
    kind: 'unknown',
    name: name || `Unknown_${id}`,
    originalXsiType: xsiType,
    originalKind: typeVal || undefined,
    rawXml,
    children: childNodes.length > 0 ? childNodes : undefined,
    ...parseBaseProps(raw),
  };
}

// ─── Base Properties ───

function parseBaseProps(raw: RawElement): BaseProps {
  const result: BaseProps = {};

  result.caption = parseLocalizedString(raw['title']);
  result.toolTip = parseLocalizedString(raw['toolTip']);
  result.layout = parseLayoutProps(raw);
  result.style = parseStyleProps(raw);
  result.events = parseHandlers(ensureArray(raw['handlers']));

  // In Form.form, visible/enabled/readOnly can be complex objects or simple bools
  result.visible = parseBoolOrDefault(raw['visible']);
  result.enabled = parseBoolOrDefault(raw['enabled']);
  result.readOnly = parseBoolOrDefault(raw['readOnly']);
  result.skipOnInput = parseBoolOrDefault(raw['skipOnInput']);

  if (raw['conditionalAppearance']) {
    result.conditionalAppearance = {
      key: 'conditionalAppearance',
      xml: JSON.stringify(raw['conditionalAppearance']),
    };
  }

  for (const key of Object.keys(result) as (keyof BaseProps)[]) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }

  return result;
}

/**
 * In Form.form, boolean properties like <visible> can be:
 * - Simple: <visible>true</visible>
 * - Complex: <visible><UserVisible>...</UserVisible></visible>
 * We extract the simple boolean and preserve complex structures.
 */
function parseBoolOrDefault(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  // Complex structure — extract inner boolean if possible
  if (typeof val === 'object') {
    const obj = val as RawElement;
    // Some Form.form files use a structure like {#text: "true"}
    if ('#text' in obj) {
      return parseBool(obj['#text']);
    }
  }
  return undefined;
}

function parseHandlers(handlers: unknown[]): import('../model/form-model').EventBinding[] | undefined {
  if (!handlers || handlers.length === 0) return undefined;
  const events: import('../model/form-model').EventBinding[] = [];
  for (const h of handlers) {
    if (!h || typeof h !== 'object') continue;
    const raw = h as RawElement;
    const event = extractText(raw['event']);
    if (!event) continue;
    events.push({
      event,
      handler: extractText(raw['name']) || extractText(raw['n']) || undefined,
    });
  }
  return events.length > 0 ? events : undefined;
}

// ─── DataPath extraction ───

function extractDataPath(raw: RawElement): string | undefined {
  const dp = raw['dataPath'];
  if (!dp) return undefined;

  if (typeof dp === 'string') return dp;

  if (typeof dp === 'object') {
    const obj = dp as RawElement;
    // Form.form pattern: <dataPath xsi:type="form:DataPath"><segments>value</segments></dataPath>
    const segments = extractText(obj['segments']);
    if (segments) return segments;

    // Fallback: direct text
    return extractText(dp);
  }

  return undefined;
}

// ─── Preserved XML collector ───

function collectPreservedXml(raw: RawElement): Record<string, string> | undefined {
  const preserved: Record<string, string> = {};
  const preserveKeys = ['extendedTooltip', 'contextMenu', 'extInfo', 'searchStringAddition', 'viewStatusAddition', 'searchControlAddition'];

  for (const key of preserveKeys) {
    if (raw[key] !== undefined) {
      preserved[key] = JSON.stringify(raw[key]);
    }
  }

  // Also preserve userVisible, which can be complex
  if (raw['userVisible'] !== undefined) {
    preserved['userVisible'] = JSON.stringify(raw['userVisible']);
  }

  return Object.keys(preserved).length > 0 ? preserved : undefined;
}

// ─── Container Parsers ───

function parseUsualGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): UsualGroupNode {
  const children = parseChildItems(raw, diagnostics);
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
    preservedXml: collectPreservedXml(raw),
  };
}

function parsePagesGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): PagesNode {
  const children = parseChildItems(raw, diagnostics).filter(
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
    preservedXml: collectPreservedXml(raw),
  };
}

function parsePageGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): PageNode {
  const children = parseChildItems(raw, diagnostics);
  return {
    ...base,
    id,
    kind: 'page',
    name,
    children,
    group: parseGroupType(raw['group']),
    picture: parsePictureRef(raw['picture']),
    preservedXml: collectPreservedXml(raw),
  };
}

function parseColumnGroup(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): ColumnGroupNode {
  const children = parseChildItems(raw, diagnostics);
  return {
    ...base,
    id,
    kind: 'columnGroup',
    name,
    children,
    group: parseGroupType(raw['group']),
    preservedXml: collectPreservedXml(raw),
  };
}

function parseCommandBar(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): CommandBarNode {
  const children = parseChildItems(raw, diagnostics) as (ButtonNode | AutoCommandBarNode)[];
  return {
    ...base,
    id,
    kind: 'commandBar',
    name,
    children,
    commandSource: extractText(raw['commandSource']),
    preservedXml: collectPreservedXml(raw),
  };
}

function parseAutoCommandBarNode(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): AutoCommandBarNode {
  const children = parseChildItems(raw, diagnostics) as ButtonNode[];
  return {
    ...base,
    id,
    kind: 'autoCommandBar',
    name,
    children,
    preservedXml: collectPreservedXml(raw),
  };
}

function parseAutoCommandBarItem(
  raw: RawElement,
  diagnostics: ParseDiagnostic[],
): AutoCommandBarNode | null {
  const id = extractText(raw['id']) || String(raw['@_id'] || '0');
  const name = extractText(raw['name']) || 'АвтоКоманднаяПанель';
  const identity: NodeIdentity = { xmlId: id, internalId: randomUUID() };
  const base = parseBaseProps(raw);
  const children = parseChildItems(raw, diagnostics) as ButtonNode[];
  return {
    ...base,
    id: identity,
    kind: 'autoCommandBar',
    name,
    children,
    preservedXml: collectPreservedXml(raw),
  };
}

// ─── Element Parsers ───

function parseField(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  typeVal: string,
  base: BaseProps,
): FieldNode {
  const fieldType = (XML_KIND_TO_FIELD_TYPE[typeVal] || 'input') as FieldType;
  return {
    ...base,
    id,
    kind: 'field',
    name,
    fieldType,
    dataPath: extractDataPath(raw),
    mask: extractText(raw['mask']),
    inputHint: extractText(raw['inputHint']),
    multiLine: parseBool(raw['multiLine']),
    choiceButton: parseBool(raw['choiceButton']),
    openButton: parseBool(raw['openButton']),
    clearButton: parseBool(raw['clearButton']),
    format: extractText(raw['format']),
    typeLink: extractText(raw['typeLink']),
    preservedXml: collectPreservedXml(raw),
  };
}

function parseDecoration(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  typeVal: string,
  base: BaseProps,
): DecorationNode {
  return {
    ...base,
    id,
    kind: 'decoration',
    name,
    decorationType: XML_KIND_TO_DECORATION_TYPE[typeVal] || 'label',
    picture: parsePictureRef(raw['picture']),
    hyperlink: parseBool(raw['hyperlink']),
    preservedXml: collectPreservedXml(raw),
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
    preservedXml: collectPreservedXml(raw),
  };
}

function parseTable(
  raw: RawElement,
  id: NodeIdentity,
  name: string,
  base: BaseProps,
  diagnostics: ParseDiagnostic[],
): TableNode {
  const rawItems = ensureArray(raw['items']);
  const columns: TableColumn[] = [];
  let commandBar: CommandBarNode | undefined;

  for (const rawEl of rawItems) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const el = rawEl as RawElement;
    const xsiType = String(el['@_xsi:type'] || '');
    const typeVal = extractText(el['type']) || '';

    if (xsiType === 'form:FormGroup' && (typeVal === 'CommandBar' || typeVal === 'AutoCommandBar')) {
      const node = parseItem(el, diagnostics);
      if (node && node.kind === 'commandBar') {
        commandBar = node as CommandBarNode;
      }
    } else {
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
    dataPath: extractDataPath(raw),
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
    preservedXml: collectPreservedXml(raw),
  };
}

function parseTableColumn(raw: RawElement): TableColumn {
  const id = extractText(raw['id']) || String(raw['@_id'] || '0');
  const name = extractText(raw['name']) || '';
  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    caption: parseLocalizedString(raw['title']),
    dataPath: extractDataPath(raw),
    visible: parseBoolOrDefault(raw['visible']),
    readOnly: parseBoolOrDefault(raw['readOnly']),
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

// ─── Child Items ───

function parseChildItems(raw: RawElement, diagnostics: ParseDiagnostic[]): FormNode[] {
  const rawItems = ensureArray(raw['items']);
  const children: FormNode[] = [];
  for (const rawEl of rawItems) {
    if (!rawEl || typeof rawEl !== 'object') continue;
    const node = parseItem(rawEl as RawElement, diagnostics);
    if (node) children.push(node);
  }
  return children;
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
  const id = extractText(raw['id']) || String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = extractText(raw['name']) || '';
  if (!name) return null;

  const children = parseFormAttributes(ensureArray(raw['attributes']), diagnostics);

  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    valueType: parseValueType(raw['valueType']),
    main: parseBool(raw['main']),
    savedData: parseBool(raw['savedData']),
    dataPath: extractDataPath(raw),
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
  const id = extractText(raw['id']) || String(raw['@_id'] || raw['@_uuid'] || '0');
  const name = extractText(raw['name']) || '';
  if (!name) return null;

  // Action in Form.form can be complex: <action xsi:type="form:FormCommandHandlerContainer">
  let action = '';
  let actionRaw: string | undefined;
  const rawAction = raw['action'];
  if (rawAction && typeof rawAction === 'object') {
    const actionObj = rawAction as RawElement;
    // Extract handler name from <handler><name>...</name></handler>
    const handler = actionObj['handler'];
    if (handler && typeof handler === 'object') {
      action = extractText((handler as RawElement)['name']) || '';
    }
    actionRaw = JSON.stringify(rawAction);
  } else {
    action = extractText(rawAction) || '';
  }

  return {
    id: { xmlId: id, internalId: randomUUID() },
    name,
    title: parseLocalizedString(raw['title']),
    action,
    actionRaw,
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
  'items', 'attributes', 'formCommands', 'autoCommandBar',
  'name', 'title', 'usePurposes', 'width', 'height',
  'windowOpeningMode', 'autoTitle', 'autoUrl', 'group',
  'platformVersion', 'commandInterface', 'handlers', 'extInfo',
  'producedTypes', 'parameters',
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
