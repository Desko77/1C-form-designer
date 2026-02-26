/**
 * Shared serializer utilities used by both xml-serializer (mdclass) and form-form-serializer (EDT).
 */

import type {
  FormNode,
  LocalizedString,
  LayoutProps,
  StyleProps,
  BindingProps,
  EventBinding,
  PictureRef,
  ColorRef,
  FontRef,
  GroupType,
} from '../model/form-model';
import { GROUP_TYPE_TO_XML } from '../parser/xml-mapping';

// ─── Types ───

export interface SerializeOptions {
  indent?: string;
  mode?: 'preserve' | 'canonical';
}

// ─── Serializer Context ───

export class SerializerContext {
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

  /** Emit a self-closing tag with optional attributes */
  emptyElement(name: string, attrs?: string[]): void {
    const indent = this.currentIndent();
    if (attrs && attrs.length > 0) {
      this.lines.push(`${indent}<${name} ${attrs.join(' ')}/>`);
    } else {
      this.lines.push(`${indent}<${name}/>`);
    }
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

// ─── XML escaping ───

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Stored XML restoration ───

export function tryParseStoredXml(json: string, _tagName: string, _indent: string): string {
  try {
    const data = JSON.parse(json);
    if (typeof data === 'string') return data;
    return `${_indent}<!-- preserved: ${_tagName} -->`;
  } catch {
    return `${_indent}<!-- preserved: ${_tagName} -->`;
  }
}

// ─── Shared serialization helpers ───

export function serializeLocalizedString(ctx: SerializerContext, tag: string, ls?: LocalizedString): void {
  if (!ls) return;
  ctx.openTag(tag);
  ctx.simpleElement('key', 'ru');
  ctx.simpleElement('value', ls.value);
  ctx.closeTag(tag);
}

export function serializeGroupType(ctx: SerializerContext, group?: GroupType): void {
  if (!group) return;
  const xmlVal = GROUP_TYPE_TO_XML[group] || capitalizeFirst(group);
  ctx.simpleElement('group', xmlVal);
}

export function serializePictureRef(ctx: SerializerContext, tag: string, ref: PictureRef): void {
  ctx.openTag(tag);
  ctx.simpleElement('source', ref.source);
  if (ref.name) ctx.simpleElement('name', ref.name);
  ctx.closeTag(tag);
}

export function serializeFontRef(ctx: SerializerContext, font: FontRef): void {
  ctx.openTag('font');
  if (font.name) ctx.simpleElement('name', font.name);
  if (font.size !== undefined) ctx.simpleElement('size', String(font.size));
  if (font.bold !== undefined) ctx.simpleElement('bold', String(font.bold));
  if (font.italic !== undefined) ctx.simpleElement('italic', String(font.italic));
  if (font.underline !== undefined) ctx.simpleElement('underline', String(font.underline));
  if (font.strikeout !== undefined) ctx.simpleElement('strikeout', String(font.strikeout));
  ctx.closeTag('font');
}

export function serializeColorRef(ctx: SerializerContext, tag: string, color: ColorRef): void {
  ctx.openTag(tag);
  if (color.styleName) ctx.simpleElement('styleName', color.styleName);
  if (color.red !== undefined) ctx.simpleElement('red', String(color.red));
  if (color.green !== undefined) ctx.simpleElement('green', String(color.green));
  if (color.blue !== undefined) ctx.simpleElement('blue', String(color.blue));
  ctx.closeTag(tag);
}

export function serializeLayoutProps(ctx: SerializerContext, layout?: LayoutProps): void {
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

export function serializeStyleProps(ctx: SerializerContext, style?: StyleProps): void {
  if (!style) return;
  if (style.font) serializeFontRef(ctx, style.font);
  if (style.textColor) serializeColorRef(ctx, 'textColor', style.textColor);
  if (style.backColor) serializeColorRef(ctx, 'backColor', style.backColor);
  if (style.borderColor) serializeColorRef(ctx, 'borderColor', style.borderColor);
}

export function serializeBindingProps(ctx: SerializerContext, bindings?: BindingProps): void {
  if (!bindings) return;
  if (bindings.dataSource) ctx.simpleElement('dataSource', bindings.dataSource);
  if (bindings.dataPath) ctx.simpleElement('dataPath', bindings.dataPath);
}

export function serializeEventBindings(ctx: SerializerContext, events?: EventBinding[]): void {
  if (!events || events.length === 0) return;
  for (const ev of events) {
    ctx.openTag('handlers');
    ctx.simpleElement('event', ev.event);
    if (ev.handler) ctx.simpleElement('n', ev.handler);
    ctx.closeTag('handlers');
  }
}

export function serializeBaseProperties(ctx: SerializerContext, node: FormNode): void {
  serializeLocalizedString(ctx, 'title', node.caption);

  if (node.visible !== undefined) ctx.simpleElement('visible', String(node.visible));
  if (node.enabled !== undefined) ctx.simpleElement('enabled', String(node.enabled));
  if (node.readOnly !== undefined) ctx.simpleElement('readOnly', String(node.readOnly));
  if (node.skipOnInput !== undefined) ctx.simpleElement('skipOnInput', String(node.skipOnInput));

  serializeLocalizedString(ctx, 'toolTip', node.toolTip);
  serializeLayoutProps(ctx, node.layout);
  serializeStyleProps(ctx, node.style);

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
