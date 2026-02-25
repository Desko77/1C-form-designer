// ─── Model ───
export type {
  FormModel,
  FormModelVersion,
  FormMeta,
  FormRoot,
  FormRootProperties,
  FormNode,
  BaseNode,
  NodeIdentity,
  LocalizedString,
  UsualGroupNode,
  PagesNode,
  PageNode,
  ColumnGroupNode,
  CommandBarNode,
  AutoCommandBarNode,
  FieldNode,
  DecorationNode,
  ButtonNode,
  TableNode,
  TableColumn,
  UnknownElementNode,
  GroupType,
  FieldType,
  FieldTypeTier1,
  FieldTypeTier2,
  FieldTypeTier3,
  PictureRef,
  LayoutProps,
  StyleProps,
  FontRef,
  ColorRef,
  BindingProps,
  EventBinding,
  FormAttribute,
  FormAttributeType,
  FormCommand,
  UnknownBlock,
} from './model/form-model';

export {
  walkFormTree,
  findNodeByInternalId,
  findNodeByXmlId,
  buildNodeIndex,
  collectAllXmlIds,
  generateNewXmlId,
  createNodeIdentity,
  findParent,
  cloneModel,
} from './model/node-utils';
export type { NodeIndex } from './model/node-utils';

// ─── Parser ───
export { parseXmlToModel } from './parser/xml-parser';
export type { ParseResult, ParseDiagnostic } from './parser/xml-parser';
export {
  XML_TO_MODEL_KIND,
  MODEL_TO_XML_KIND,
  XML_KIND_TO_FIELD_TYPE,
  FIELD_TYPE_TO_XML_KIND,
  XML_KIND_TO_DECORATION_TYPE,
  DECORATION_TYPE_TO_XML_KIND,
  GROUP_TYPE_TO_XML,
  XML_TO_GROUP_TYPE,
  KNOWN_NAMESPACES,
} from './parser/xml-mapping';

// ─── Serializer ───
export { serializeModelToXml } from './serializer/xml-serializer';
export type { SerializeOptions } from './serializer/xml-serializer';

// ─── Validator ───
export { validateModel } from './validator/validator';
export type { ValidationDiagnostic } from './validator/validator';

// ─── Commands ───
export { CommandEngine } from './commands/command-engine';
export type { FormPatch, CommandResult, ICommandEngine } from './commands/command-engine';

// ─── Layout ───
export { LayoutEngine, createLayoutEngine } from './layout/layout-engine';
export type { ILayoutEngine, LayoutResult, LayoutBox, Size } from './layout/layout-engine';

// ─── Naming ───
export { generateElementName, generateColumnName } from './naming/auto-naming';
