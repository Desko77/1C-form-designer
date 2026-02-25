/**
 * FormModel v1.0 — Canonical TypeScript interfaces.
 * This file is the SINGLE SOURCE OF TRUTH for the form model.
 * JSON Schema is auto-generated from these interfaces.
 */

export type FormModelVersion = '1.0';

// ═══════════════════════════════════════════
// FormModel — root container
// ═══════════════════════════════════════════

export interface FormModel {
  version: FormModelVersion;
  meta?: FormMeta;
  form: FormRoot;

  /** Form attributes (readonly in v0.1) */
  attributes?: FormAttribute[];

  /** Form commands (readonly in v0.1) */
  commands?: FormCommand[];

  /** Unknown / vendor-specific XML fragments preserved for round-trip */
  unknownBlocks?: UnknownBlock[];
}

export interface FormMeta {
  origin?: { uri?: string; lineStart?: number; lineEnd?: number };
  formatting?: { mode: 'preserve' | 'canonical' };
  platformVersion?: string;
  xmlNamespaces?: Record<string, string>;
  exportFormat?: 'edt' | 'configurator';
}

// ═══════════════════════════════════════════
// Node Identity
// ═══════════════════════════════════════════

export interface NodeIdentity {
  /** Original id from XML (numeric, preserved for round-trip) */
  xmlId: string;
  /** Internal designer id (UUID, for undo/diff/UI refs) */
  internalId: string;
}

// ═══════════════════════════════════════════
// Form Root
// ═══════════════════════════════════════════

export interface FormRoot {
  id: NodeIdentity;
  name: string;
  caption?: LocalizedString;
  autoCommandBar?: AutoCommandBarNode;
  children: FormNode[];
  formProperties?: FormRootProperties;
}

export interface FormRootProperties {
  width?: number;
  height?: number;
  windowOpeningMode?: 'LockOwnerWindow' | 'LockWholeInterface' | 'Independent';
  autoTitle?: boolean;
  autoUrl?: boolean;
  group?: GroupType;
}

// ═══════════════════════════════════════════
// Localization
// ═══════════════════════════════════════════

export interface LocalizedString {
  value: string;
  translations?: Record<string, string>;
}

// ═══════════════════════════════════════════
// FormNode — discriminated union
// ═══════════════════════════════════════════

export type FormNode =
  | UsualGroupNode
  | PagesNode
  | PageNode
  | ColumnGroupNode
  | CommandBarNode
  | AutoCommandBarNode
  | FieldNode
  | DecorationNode
  | ButtonNode
  | TableNode
  | UnknownElementNode;

// ═══════════════════════════════════════════
// BaseNode — shared properties
// ═══════════════════════════════════════════

export interface BaseNode {
  id: NodeIdentity;
  kind: string;
  name: string;
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

// ═══════════════════════════════════════════
// Containers (1:1 mapping to FormGroup + kind)
// ═══════════════════════════════════════════

export interface UsualGroupNode extends BaseNode {
  kind: 'usualGroup';
  children: FormNode[];
  group?: GroupType;
  representation?: 'none' | 'normalSeparation' | 'strongSeparation' | 'weakSeparation';
  showTitle?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
}

export interface PagesNode extends BaseNode {
  kind: 'pages';
  children: PageNode[];
  pagesRepresentation?: 'none' | 'tabsOnTop' | 'tabsOnBottom' | 'tabsOnLeft' | 'tabsOnRight';
}

export interface PageNode extends BaseNode {
  kind: 'page';
  children: FormNode[];
  group?: GroupType;
  picture?: PictureRef;
}

export interface ColumnGroupNode extends BaseNode {
  kind: 'columnGroup';
  children: FormNode[];
  group?: GroupType;
}

export interface CommandBarNode extends BaseNode {
  kind: 'commandBar';
  children: (ButtonNode | AutoCommandBarNode)[];
  commandSource?: string;
}

export interface AutoCommandBarNode extends BaseNode {
  kind: 'autoCommandBar';
  children: ButtonNode[];
}

// ═══════════════════════════════════════════
// Elements
// ═══════════════════════════════════════════

export interface DecorationNode extends BaseNode {
  kind: 'decoration';
  decorationType: 'label' | 'picture';
  picture?: PictureRef;
  hyperlink?: boolean;
}

export interface FieldNode extends BaseNode {
  kind: 'field';
  fieldType: FieldType;
  dataPath?: string;
  mask?: string;
  inputHint?: string;
  multiLine?: boolean;
  choiceButton?: boolean;
  openButton?: boolean;
  clearButton?: boolean;
  format?: string;
  typeLink?: string;
}

export type FieldTypeTier1 = 'input' | 'checkbox' | 'labelField';
export type FieldTypeTier2 =
  | 'radioButton'
  | 'textBox'
  | 'number'
  | 'date'
  | 'tumbler'
  | 'spinner'
  | 'pictureField';
export type FieldTypeTier3 =
  | 'trackBar'
  | 'progressBar'
  | 'htmlField'
  | 'calendarField'
  | 'chartField'
  | 'formattedDocField'
  | 'plannerField'
  | 'periodField'
  | 'textDocField'
  | 'spreadsheetDocField'
  | 'graphicalSchemaField'
  | 'geoSchemaField'
  | 'dendrogramField';
export type FieldType = FieldTypeTier1 | FieldTypeTier2 | FieldTypeTier3;

export interface ButtonNode extends BaseNode {
  kind: 'button';
  commandName?: string;
  buttonType?: 'default' | 'hyperlink' | 'usualButton' | 'commandBarButton';
  defaultButton?: boolean;
  picture?: PictureRef;
  representation?: 'auto' | 'text' | 'picture' | 'textPicture';
  onlyInCommandBar?: boolean;
}

export interface TableNode extends BaseNode {
  kind: 'table';
  dataPath?: string;
  columns: TableColumn[];
  commandBar?: CommandBarNode;
  searchStringLocation?: 'none' | 'top' | 'bottom';
  rowCount?: number;
  selectionMode?: 'single' | 'multi';
  header?: boolean;
  footer?: boolean;
  horizontalLines?: boolean;
  verticalLines?: boolean;
  headerFixing?: 'none' | 'fixHeader';
}

export interface TableColumn {
  id: NodeIdentity;
  name: string;
  caption?: LocalizedString;
  dataPath?: string;
  visible?: boolean;
  readOnly?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  autoMaxWidth?: boolean;
  cellType?: string;
  choiceButton?: boolean;
  clearButton?: boolean;
  format?: string;
  footerText?: string;
}

// ═══════════════════════════════════════════
// UnknownElementNode — Tier 3
// ═══════════════════════════════════════════

export interface UnknownElementNode extends BaseNode {
  kind: 'unknown';
  originalXsiType: string;
  originalKind?: string;
  rawXml: string;
  children?: FormNode[];
}

// ═══════════════════════════════════════════
// Auxiliary types
// ═══════════════════════════════════════════

export type GroupType =
  | 'vertical'
  | 'horizontal'
  | 'horizontalIfPossible'
  | 'alwaysHorizontal'
  | 'columnsLikeInList'
  | 'indentedColumnsLikeInList';

export interface PictureRef {
  source: string;
  name?: string;
}

/** LayoutProps — INPUT properties from XML. Does NOT contain computed coordinates. */
export interface LayoutProps {
  width?: number;
  height?: number;
  autoMaxWidth?: boolean;
  autoMaxHeight?: boolean;
  horizontalStretch?: boolean;
  verticalStretch?: boolean;
  groupInColumn?: number;
  titleLocation?: 'auto' | 'left' | 'top' | 'bottom' | 'right' | 'none';
}

export interface StyleProps {
  font?: FontRef;
  textColor?: ColorRef;
  backColor?: ColorRef;
  borderColor?: ColorRef;
}

export interface FontRef {
  name?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
}

export interface ColorRef {
  styleName?: string;
  red?: number;
  green?: number;
  blue?: number;
}

export interface BindingProps {
  dataSource?: string;
  dataPath?: string;
}

export interface EventBinding {
  event: string;
  handler?: string;
}

// ═══════════════════════════════════════════
// Form Attributes — readonly in v0.1
// ═══════════════════════════════════════════

export interface FormAttribute {
  id: NodeIdentity;
  name: string;
  valueType?: FormAttributeType;
  main?: boolean;
  savedData?: boolean;
  dataPath?: string;
  children?: FormAttribute[];
}

export interface FormAttributeType {
  types: string[];
  stringLength?: number;
  numberLength?: number;
  numberPrecision?: number;
  dateFractions?: 'date' | 'time' | 'dateTime';
}

// ═══════════════════════════════════════════
// Form Commands — readonly in v0.1
// ═══════════════════════════════════════════

export interface FormCommand {
  id: NodeIdentity;
  name: string;
  title?: LocalizedString;
  action: string;
  picture?: PictureRef;
  toolTip?: LocalizedString;
  use?: 'auto' | 'always' | 'never';
  representation?: string;
  modifiesStoredData?: boolean;
  shortcut?: string;
}

// ═══════════════════════════════════════════
// Unknown Blocks — round-trip safety
// ═══════════════════════════════════════════

export interface UnknownBlock {
  key: string;
  xml: string;
  position?: number;
}
