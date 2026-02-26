import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFormXml } from '../src/parser/parse';
import { serializeModelToFormat } from '../src/serializer/serialize';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const FORM_FORM_XML = readFileSync(resolve(FIXTURES_DIR, 'simple.form.form'), 'utf-8');

const MDCLASS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="a1b2c3d4-e5f6-7890-abcd-ef1234567890">
  <n>ФормаЭлемента</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
    <dataPath>Объект.Поле1</dataPath>
  </elements>
</mdclass:ManagedForm>`;

describe('Unified parseFormXml', () => {
  it('should route Form.form to form-form parser', () => {
    const { model } = parseFormXml(FORM_FORM_XML);

    expect(model.meta?.exportFormat).toBe('edt-form');
    expect(model.form.children.length).toBe(3);
  });

  it('should route mdclass XML to xml-parser', () => {
    const { model } = parseFormXml(MDCLASS_XML);

    expect(model.meta?.exportFormat).toBe('edt');
    expect(model.form.name).toBe('ФормаЭлемента');
  });

  it('should handle unknown format gracefully', () => {
    const { diagnostics } = parseFormXml('<SomeOther/>');

    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('Unified serializeModelToFormat', () => {
  it('should serialize edt-form model to Form.form XML', () => {
    const { model } = parseFormXml(FORM_FORM_XML);
    const xml = serializeModelToFormat(model);

    expect(xml).toContain('<form:Form');
    expect(xml).toContain('<items');
  });

  it('should serialize edt model to mdclass XML', () => {
    const { model } = parseFormXml(MDCLASS_XML);
    const xml = serializeModelToFormat(model);

    expect(xml).toContain('mdclass:ManagedForm');
    expect(xml).toContain('<elements');
  });
});
