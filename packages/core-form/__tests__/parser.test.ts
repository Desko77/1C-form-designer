import { describe, it, expect } from 'vitest';
import { parseXmlToModel } from '../src/parser/xml-parser';

const SIMPLE_FORM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="a1b2c3d4-e5f6-7890-abcd-ef1234567890">
  <producedTypes>some data</producedTypes>
  <n>ФормаЭлемента</n>
  <usePurposes>PersonalComputer</usePurposes>
  <elements xsi:type="FormGroup" id="1" name="ГруппаОсновная">
    <kind>UsualGroup</kind>
    <group>Vertical</group>
    <showTitle>true</showTitle>
    <title><key>ru</key><value>Основная информация</value></title>
    <elements xsi:type="FormField" id="2" name="Наименование">
      <kind>InputField</kind>
      <dataPath>Объект.Наименование</dataPath>
      <handlers><event>OnChange</event><n>НаименованиеПриИзменении</n></handlers>
    </elements>
    <elements xsi:type="FormField" id="3" name="Код">
      <kind>InputField</kind>
      <dataPath>Объект.Код</dataPath>
    </elements>
  </elements>
  <elements xsi:type="FormDecoration" id="4" name="НадписьИнфо">
    <kind>Label</kind>
    <title><key>ru</key><value>Заполните обязательные поля</value></title>
  </elements>
  <elements xsi:type="FormButton" id="5" name="КнопкаЗаписать">
    <commandName>Form.Command.Записать</commandName>
    <defaultButton>true</defaultButton>
  </elements>
  <commands uuid="c1">
    <name>Записать</name>
    <action>Записать</action>
    <title><key>ru</key><value>Записать</value></title>
  </commands>
</mdclass:ManagedForm>`;

describe('XML Parser', () => {
  it('should parse a simple form XML', () => {
    const { model, diagnostics } = parseXmlToModel(SIMPLE_FORM_XML);

    expect(model.version).toBe('1.0');
    expect(model.form.name).toBe('ФормаЭлемента');
    expect(model.form.id.xmlId).toBeTruthy();
    expect(model.form.id.internalId).toBeTruthy();
  });

  it('should parse form elements', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    // Root should have 3 children: group, decoration, button
    expect(model.form.children.length).toBe(3);

    const group = model.form.children[0];
    expect(group.kind).toBe('usualGroup');
    expect(group.name).toBe('ГруппаОсновная');
  });

  it('should parse nested elements in groups', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const group = model.form.children[0];
    expect(group.kind).toBe('usualGroup');
    if (group.kind === 'usualGroup') {
      expect(group.children.length).toBe(2);
      expect(group.children[0].kind).toBe('field');
      expect(group.children[0].name).toBe('Наименование');
      expect(group.children[1].name).toBe('Код');
    }
  });

  it('should parse field properties', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const field = group.children[0];
      if (field.kind === 'field') {
        expect(field.fieldType).toBe('input');
        expect(field.dataPath).toBe('Объект.Наименование');
      }
    }
  });

  it('should parse event handlers', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const field = group.children[0];
      expect(field.events).toBeDefined();
      expect(field.events!.length).toBe(1);
      expect(field.events![0].event).toBe('OnChange');
      expect(field.events![0].handler).toBe('НаименованиеПриИзменении');
    }
  });

  it('should parse decoration elements', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const decoration = model.form.children[1];
    expect(decoration.kind).toBe('decoration');
    if (decoration.kind === 'decoration') {
      expect(decoration.decorationType).toBe('label');
      expect(decoration.caption?.value).toBe('Заполните обязательные поля');
    }
  });

  it('should parse button elements', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const button = model.form.children[2];
    expect(button.kind).toBe('button');
    if (button.kind === 'button') {
      expect(button.commandName).toBe('Form.Command.Записать');
      expect(button.defaultButton).toBe(true);
    }
  });

  it('should parse form commands', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    expect(model.commands).toBeDefined();
    expect(model.commands!.length).toBe(1);
    expect(model.commands![0].name).toBe('Записать');
    expect(model.commands![0].action).toBe('Записать');
  });

  it('should parse group properties', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      expect(group.group).toBe('vertical');
      expect(group.showTitle).toBe(true);
      expect(group.caption?.value).toBe('Основная информация');
    }
  });

  it('should extract XML namespaces', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    expect(model.meta?.xmlNamespaces).toBeDefined();
    expect(model.meta?.exportFormat).toBe('edt');
  });

  it('should handle malformed XML gracefully', () => {
    const { model, diagnostics } = parseXmlToModel('<broken xml>>>>>');

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe('error');
  });

  it('should handle missing root element', () => {
    const { diagnostics } = parseXmlToModel('<?xml version="1.0"?><SomeOther/>');

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('ManagedForm');
  });

  it('should assign unique internalIds', () => {
    const { model } = parseXmlToModel(SIMPLE_FORM_XML);

    const ids = new Set<string>();
    ids.add(model.form.id.internalId);

    function collectIds(nodes: import('../src/model/form-model').FormNode[]) {
      for (const node of nodes) {
        expect(ids.has(node.id.internalId)).toBe(false);
        ids.add(node.id.internalId);
        if ('children' in node && Array.isArray(node.children)) {
          collectIds(node.children as import('../src/model/form-model').FormNode[]);
        }
      }
    }

    collectIds(model.form.children);
    expect(ids.size).toBeGreaterThan(4); // root + 5 elements
  });
});

describe('XML Parser — Table', () => {
  const TABLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="table-form-uuid">
  <n>ФормаТаблицы</n>
  <elements xsi:type="FormTable" id="10" name="ТаблицаТовары">
    <dataPath>Объект.Товары</dataPath>
    <elements xsi:type="FormField" id="11" name="ТоварыНоменклатура">
      <kind>InputField</kind>
      <dataPath>Объект.Товары.Номенклатура</dataPath>
    </elements>
    <elements xsi:type="FormField" id="12" name="ТоварыКоличество">
      <kind>InputField</kind>
      <dataPath>Объект.Товары.Количество</dataPath>
    </elements>
  </elements>
</mdclass:ManagedForm>`;

  it('should parse a table with columns', () => {
    const { model } = parseXmlToModel(TABLE_XML);

    expect(model.form.children.length).toBe(1);
    const table = model.form.children[0];
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      expect(table.dataPath).toBe('Объект.Товары');
      expect(table.columns.length).toBe(2);
      expect(table.columns[0].name).toBe('ТоварыНоменклатура');
      expect(table.columns[1].name).toBe('ТоварыКоличество');
    }
  });
});

describe('XML Parser — Pages', () => {
  const PAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="pages-form-uuid">
  <n>ФормаСоСтраницами</n>
  <elements xsi:type="FormGroup" id="20" name="СтраницыОсновные">
    <kind>Pages</kind>
    <elements xsi:type="FormGroup" id="21" name="СтраницаОсновная">
      <kind>Page</kind>
      <title><key>ru</key><value>Основная</value></title>
      <elements xsi:type="FormField" id="22" name="ПолеНаСтранице">
        <kind>InputField</kind>
      </elements>
    </elements>
    <elements xsi:type="FormGroup" id="23" name="СтраницаДополнительная">
      <kind>Page</kind>
      <title><key>ru</key><value>Дополнительная</value></title>
    </elements>
  </elements>
</mdclass:ManagedForm>`;

  it('should parse pages with nested pages', () => {
    const { model } = parseXmlToModel(PAGES_XML);

    const pages = model.form.children[0];
    expect(pages.kind).toBe('pages');
    if (pages.kind === 'pages') {
      expect(pages.children.length).toBe(2);
      expect(pages.children[0].kind).toBe('page');
      expect(pages.children[0].name).toBe('СтраницаОсновная');
      expect(pages.children[1].name).toBe('СтраницаДополнительная');

      // Check page children
      if (pages.children[0].kind === 'page') {
        expect(pages.children[0].children.length).toBe(1);
        expect(pages.children[0].children[0].kind).toBe('field');
      }
    }
  });
});

describe('XML Parser — Unknown elements', () => {
  const UNKNOWN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore"
  xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="unknown-form-uuid">
  <n>ФормаСНеизвестным</n>
  <elements xsi:type="SomeFutureType" id="99" name="НовыйТип">
    <kind>SomeFutureKind</kind>
    <customProp>value</customProp>
  </elements>
</mdclass:ManagedForm>`;

  it('should preserve unknown elements as UnknownElementNode', () => {
    const { model, diagnostics } = parseXmlToModel(UNKNOWN_XML);

    expect(model.form.children.length).toBe(1);
    const unknown = model.form.children[0];
    expect(unknown.kind).toBe('unknown');
    if (unknown.kind === 'unknown') {
      expect(unknown.originalXsiType).toBe('SomeFutureType');
      expect(unknown.rawXml).toBeTruthy();
    }

    // Should have an info diagnostic about the unknown element
    const unknownDiag = diagnostics.find((d) => d.message.includes('Unknown element'));
    expect(unknownDiag).toBeDefined();
  });
});
