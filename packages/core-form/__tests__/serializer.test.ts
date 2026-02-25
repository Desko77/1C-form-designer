import { describe, it, expect } from 'vitest';
import { parseXmlToModel } from '../src/parser/xml-parser';
import { serializeModelToXml } from '../src/serializer/xml-serializer';

const SIMPLE_FORM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="a1b2c3d4-e5f6-7890-abcd-ef1234567890">
  <n>ФормаЭлемента</n>
  <elements xsi:type="FormGroup" id="1" name="ГруппаОсновная">
    <kind>UsualGroup</kind>
    <group>Vertical</group>
    <showTitle>true</showTitle>
    <title><key>ru</key><value>Основная</value></title>
    <elements xsi:type="FormField" id="2" name="Наименование">
      <kind>InputField</kind>
      <dataPath>Объект.Наименование</dataPath>
    </elements>
  </elements>
  <elements xsi:type="FormButton" id="3" name="КнопкаОК">
    <commandName>Form.StandardCommand.OK</commandName>
    <defaultButton>true</defaultButton>
  </elements>
</mdclass:ManagedForm>`;

describe('XML Serializer', () => {
  it('should serialize a parsed model back to XML', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('mdclass:ManagedForm');
    expect(xml).toContain('ФормаЭлемента');
  });

  it('should preserve element names', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('ГруппаОсновная');
    expect(xml).toContain('Наименование');
    expect(xml).toContain('КнопкаОК');
  });

  it('should preserve element types (xsi:type)', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('xsi:type="FormGroup"');
    expect(xml).toContain('xsi:type="FormField"');
    expect(xml).toContain('xsi:type="FormButton"');
  });

  it('should preserve kind values', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('<kind>UsualGroup</kind>');
    expect(xml).toContain('<kind>InputField</kind>');
  });

  it('should preserve data paths', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('<dataPath>Объект.Наименование</dataPath>');
  });

  it('should preserve button properties', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('<commandName>Form.StandardCommand.OK</commandName>');
    expect(xml).toContain('<defaultButton>true</defaultButton>');
  });

  it('should preserve group properties', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('<group>Vertical</group>');
    expect(xml).toContain('<showTitle>true</showTitle>');
  });

  it('round-trip: parse → serialize → parse should produce equivalent model', () => {
    const { model: model1 } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model1);
    const { model: model2 } = parseXmlToModel(xml);

    // Compare structure (ignoring internalIds which are regenerated)
    expect(model2.form.name).toBe(model1.form.name);
    expect(model2.form.children.length).toBe(model1.form.children.length);

    // Compare first child
    expect(model2.form.children[0].kind).toBe(model1.form.children[0].kind);
    expect(model2.form.children[0].name).toBe(model1.form.children[0].name);

    // Compare nested children
    if (model2.form.children[0].kind === 'usualGroup' && model1.form.children[0].kind === 'usualGroup') {
      expect(model2.form.children[0].children.length).toBe(model1.form.children[0].children.length);
    }
  });

  it('should include xmlns declarations', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);
    const xml = serializeModelToXml(model);

    expect(xml).toContain('xmlns:xsi=');
    expect(xml).toContain('xmlns:core=');
    expect(xml).toContain('xmlns:mdclass=');
  });
});
