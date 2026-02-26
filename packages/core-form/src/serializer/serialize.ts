/**
 * Unified entry point for serializing FormModel to the appropriate XML format.
 * Routes by model.meta.exportFormat.
 */

import type { FormModel } from '../model/form-model';
import { serializeModelToXml } from './xml-serializer';
import { serializeModelToFormForm } from './form-form-serializer';
import type { SerializeOptions } from './serializer-utils';

export function serializeModelToFormat(model: FormModel, options?: SerializeOptions): string {
  const format = model.meta?.exportFormat;

  switch (format) {
    case 'edt-form':
      return serializeModelToFormForm(model, options);

    case 'edt':
    case 'configurator':
    default:
      return serializeModelToXml(model, options);
  }
}
