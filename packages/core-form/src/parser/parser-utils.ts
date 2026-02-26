/**
 * Shared parser utilities used by both xml-parser (mdclass) and form-form-parser (EDT).
 */

import type {
  LocalizedString,
  LayoutProps,
  StyleProps,
  BindingProps,
  EventBinding,
  PictureRef,
  ColorRef,
  FontRef,
  GroupType,
  UnknownBlock,
} from '../model/form-model';
import { XML_TO_GROUP_TYPE } from './xml-mapping';

// ─── Shared types ───

export interface RawElement {
  [key: string]: unknown;
}

export interface ParseResult {
  model: import('../model/form-model').FormModel;
  diagnostics: ParseDiagnostic[];
}

export interface ParseDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
}

export interface BaseProps {
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

// ─── Primitive extractors ───

export function extractText(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('value' in obj) return extractText(obj['value']);
    if ('#text' in obj) return String(obj['#text']);
  }
  return undefined;
}

export function parseBool(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined;
}

export function parseNumber(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

export function parseEnum<T extends string>(val: string | undefined, allowed: T[]): T | undefined {
  if (!val) return undefined;
  const lower = val.toLowerCase();
  return allowed.find((a) => a.toLowerCase() === lower);
}

export function ensureArray(val: unknown): unknown[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

// ─── Localized strings ───

export function parseLocalizedString(val: unknown): LocalizedString | undefined {
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

    // Pattern: <title>#text</title>
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

    const text = extractText(obj['value']) || extractText(val);
    if (text) return { value: text };
  }

  return undefined;
}

// ─── References ───

export function parsePictureRef(val: unknown): PictureRef | undefined {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as RawElement;
  const source = extractText(obj['source']) || extractText(obj['value']) || extractText(val);
  if (!source) return undefined;
  return { source, name: extractText(obj['name']) };
}

export function parseFontRef(val: unknown): FontRef | undefined {
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

export function parseColorRef(val: unknown): ColorRef | undefined {
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

// ─── Group type ───

export function parseGroupType(val: unknown): GroupType | undefined {
  const text = extractText(val);
  if (!text) return undefined;
  const mapped = XML_TO_GROUP_TYPE[text];
  if (mapped) return mapped as GroupType;
  return parseEnum(text, [
    'vertical', 'horizontal', 'horizontalIfPossible',
    'alwaysHorizontal', 'columnsLikeInList', 'indentedColumnsLikeInList',
  ]) as GroupType | undefined;
}

// ─── Composite property parsers ───

export function parseLayoutProps(raw: RawElement): LayoutProps | undefined {
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

export function parseStyleProps(raw: RawElement): StyleProps | undefined {
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

export function parseBindingProps(raw: RawElement): BindingProps | undefined {
  const ds = extractText(raw['dataSource']);
  const dp = extractText(raw['dataPath']);
  if (!ds && !dp) return undefined;
  return { dataSource: ds, dataPath: dp };
}

export function parseBaseProperties(raw: RawElement): BaseProps {
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

  for (const key of Object.keys(result) as (keyof BaseProps)[]) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }

  return result;
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
