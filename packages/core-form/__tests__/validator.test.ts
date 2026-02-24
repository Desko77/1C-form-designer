import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validator/validator';
import { parseXmlToModel } from '../src/parser/xml-parser';
import type { FormModel, UsualGroupNode, FieldNode } from '../src/model/form-model';

describe('Validator', () => {
  it('should pass validation for a valid form', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="valid-form">
  <n>ВалиднаяФорма</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Поле2">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const diagnostics = validateModel(model);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('should detect duplicate xmlIds', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="dup-id-form">
  <n>ФормаДупликат</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="1" name="Поле2">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const diagnostics = validateModel(model);
    const dupErrors = diagnostics.filter((d) => d.message.includes('Duplicate xmlId'));
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it('should detect duplicate sibling names', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="dup-name-form">
  <n>ФормаДупИмя</n>
  <elements xsi:type="FormField" id="1" name="Поле">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Поле">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const diagnostics = validateModel(model);
    const dupErrors = diagnostics.filter((d) => d.message.includes('Duplicate name'));
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it('should detect invalid event handler names', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="bad-handler-form">
  <n>ФормаПлохойОбработчик</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
    <handlers><event>OnChange</event><n>123-invalid!</n></handlers>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const diagnostics = validateModel(model);
    const handlerWarnings = diagnostics.filter((d) => d.message.includes('Invalid BSL handler'));
    expect(handlerWarnings.length).toBeGreaterThan(0);
  });
});
