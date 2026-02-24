import { describe, it, expect } from 'vitest';
import { generateElementName } from '../src/naming/auto-naming';
import { parseXmlToModel } from '../src/parser/xml-parser';

const FORM_WITH_ELEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="naming-test">
  <n>ТестИмен</n>
  <elements xsi:type="FormGroup" id="1" name="Группа1">
    <kind>UsualGroup</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Поле1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="3" name="Поле2">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

describe('Auto-naming', () => {
  it('should generate next available name for groups', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'usualGroup');
    expect(name).toBe('Группа2');
  });

  it('should generate next available name for fields', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'field', 'input');
    expect(name).toBe('Поле3');
  });

  it('should generate name starting from 1 for new types', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'button');
    expect(name).toBe('Кнопка1');
  });

  it('should generate checkbox names', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'field', 'checkbox');
    expect(name).toBe('Флажок1');
  });

  it('should generate decoration names', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'decoration', 'label');
    expect(name).toBe('Декорация1');
  });

  it('should generate table names', () => {
    const { model } = parseXmlToModel(FORM_WITH_ELEMENTS);
    const name = generateElementName(model, 'table');
    expect(name).toBe('Таблица1');
  });

  it('should skip existing names', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="skip-test">
  <n>ТестПропуск</n>
  <elements xsi:type="FormField" id="1" name="Кнопка1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Кнопка2">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const name = generateElementName(model, 'button');
    expect(name).toBe('Кнопка3');
  });
});
