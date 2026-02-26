/**
 * Quick format detection by inspecting the first ~500 characters of XML.
 */

export type FormFormat = 'form-form' | 'mdclass' | 'configurator' | 'unknown';

export function detectFormFormat(xml: string): FormFormat {
  const head = xml.slice(0, 500);

  // EDT Form.form: root element is <form:Form
  if (/<form:Form[\s>]/.test(head)) {
    return 'form-form';
  }

  // mdclass format (EDT DumpConfigToFiles): <mdclass:ManagedForm or similar with mdclass namespace
  if (/mdclass:ManagedForm[\s>]/.test(head)) {
    return 'mdclass';
  }

  // Configurator format: ManagedForm with xcf namespace
  if (/xmlns[^=]*=\s*["'][^"']*xcf/.test(head) && /ManagedForm[\s>]/.test(head)) {
    return 'configurator';
  }

  // Bare ManagedForm without mdclass prefix — treat as mdclass
  if (/<ManagedForm[\s>]/.test(head)) {
    return 'mdclass';
  }

  return 'unknown';
}
