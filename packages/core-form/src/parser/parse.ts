/**
 * Unified entry point for parsing any supported 1C form XML format.
 * Auto-detects format and delegates to the appropriate parser.
 */

import { detectFormFormat } from './format-detector';
import { parseXmlToModel } from './xml-parser';
import { parseFormFormToModel } from './form-form-parser';
import type { ParseResult } from './parser-utils';

export function parseFormXml(xml: string, uri?: string): ParseResult {
  const format = detectFormFormat(xml);

  switch (format) {
    case 'form-form':
      return parseFormFormToModel(xml, uri);

    case 'mdclass':
    case 'configurator':
      return parseXmlToModel(xml, uri);

    case 'unknown':
      // Fall back to mdclass parser — it will produce a diagnostic
      return parseXmlToModel(xml, uri);
  }
}
