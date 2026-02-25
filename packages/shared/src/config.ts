/**
 * Designer configuration constants and defaults.
 */

export const DEFAULT_CONFIG = {
  formattingMode: 'preserve' as const,
  maxUndo: 200,
  defaultView: 'design' as const,
};

export const EXTENSION_ID = 'formDesigner.managedForm';
export const OUTPUT_CHANNEL_NAME = '1C Form Designer';

/** File patterns for form detection */
export const FORM_FILE_PATTERNS = {
  edtFormat: '**/Ext/Form.xml',
  conventionFormat: '*.form.xml',
};
