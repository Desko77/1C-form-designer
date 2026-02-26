import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFormFormToModel } from '../src/parser/form-form-parser';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const SIMPLE_FORM = readFileSync(resolve(FIXTURES_DIR, 'simple.form.form'), 'utf-8');
const COMPLEX_FORM = readFileSync(resolve(FIXTURES_DIR, 'complex.form.form'), 'utf-8');

describe('Form.form Parser — Simple', () => {
  it('should parse a simple Form.form', () => {
    const { model, diagnostics } = parseFormFormToModel(SIMPLE_FORM);

    expect(model.version).toBe('1.0');
    expect(model.meta?.exportFormat).toBe('edt-form');
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('should set form root UUID', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    expect(model.form.id.xmlId).toBe('b1c2d3e4-f5a6-7890-bcde-f12345678901');
  });

  it('should parse form elements (items)', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    // Root should have 3 children: group, decoration, button
    expect(model.form.children.length).toBe(3);

    const group = model.form.children[0];
    expect(group.kind).toBe('usualGroup');
    expect(group.name).toBe('ГруппаОсновная');
  });

  it('should parse nested items in groups', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const group = model.form.children[0];
    expect(group.kind).toBe('usualGroup');
    if (group.kind === 'usualGroup') {
      expect(group.children.length).toBe(2);
      expect(group.children[0].kind).toBe('field');
      expect(group.children[0].name).toBe('Наименование');
      expect(group.children[1].name).toBe('Код');
    }
  });

  it('should parse field properties with structured DataPath', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const field = group.children[0];
      if (field.kind === 'field') {
        expect(field.fieldType).toBe('input');
        expect(field.dataPath).toBe('Объект.Наименование');
      }
    }
  });

  it('should parse event handlers with <name> tag', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

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
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const decoration = model.form.children[1];
    expect(decoration.kind).toBe('decoration');
    if (decoration.kind === 'decoration') {
      expect(decoration.decorationType).toBe('label');
      expect(decoration.caption?.value).toBe('Заполните обязательные поля');
    }
  });

  it('should parse button elements', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const button = model.form.children[2];
    expect(button.kind).toBe('button');
    if (button.kind === 'button') {
      expect(button.commandName).toBe('Form.Command.Записать');
      expect(button.defaultButton).toBe(true);
    }
  });

  it('should parse formCommands with complex action', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    expect(model.commands).toBeDefined();
    expect(model.commands!.length).toBe(1);
    expect(model.commands![0].name).toBe('Записать');
    expect(model.commands![0].action).toBe('Записать');
    expect(model.commands![0].actionRaw).toBeDefined();
  });

  it('should parse group properties', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      expect(group.group).toBe('vertical');
      expect(group.showTitle).toBe(true);
      expect(group.caption?.value).toBe('Основная информация');
    }
  });

  it('should extract XML namespaces', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    expect(model.meta?.xmlNamespaces).toBeDefined();
    expect(model.meta?.xmlNamespaces?.['form']).toBe('http://g5.1c.ru/v8/dt/form');
  });

  it('should parse element IDs from child tags', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

    const group = model.form.children[0];
    expect(group.id.xmlId).toBe('1');

    if (group.kind === 'usualGroup') {
      expect(group.children[0].id.xmlId).toBe('2');
      expect(group.children[1].id.xmlId).toBe('3');
    }
  });

  it('should assign unique internalIds', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);

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
    expect(ids.size).toBeGreaterThan(4);
  });
});

describe('Form.form Parser — Complex', () => {
  it('should parse pages with nested pages', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);

    const pages = model.form.children[0];
    expect(pages.kind).toBe('pages');
    if (pages.kind === 'pages') {
      expect(pages.children.length).toBe(2);
      expect(pages.children[0].kind).toBe('page');
      expect(pages.children[0].name).toBe('СтраницаОсновная');
      expect(pages.children[1].name).toBe('СтраницаДополнительная');

      if (pages.children[0].kind === 'page') {
        expect(pages.children[0].children.length).toBe(2);
        expect(pages.children[0].children[0].kind).toBe('field');
        expect(pages.children[0].children[1].kind).toBe('field');
      }
    }
  });

  it('should parse checkbox field type', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);

    const pages = model.form.children[0];
    if (pages.kind === 'pages') {
      const page = pages.children[0];
      if (page.kind === 'page') {
        const checkbox = page.children[1];
        if (checkbox.kind === 'field') {
          expect(checkbox.fieldType).toBe('checkbox');
        }
      }
    }
  });

  it('should parse table with columns', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);

    const table = model.form.children[1];
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      expect(table.dataPath).toBe('Объект.Товары');
      expect(table.columns.length).toBe(2);
      expect(table.columns[0].name).toBe('ТоварыНоменклатура');
      expect(table.columns[0].dataPath).toBe('Объект.Товары.Номенклатура');
      expect(table.columns[1].name).toBe('ТоварыКоличество');
    }
  });

  it('should parse form attributes', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);

    expect(model.attributes).toBeDefined();
    expect(model.attributes!.length).toBe(1);
    expect(model.attributes![0].name).toBe('Объект');
    expect(model.attributes![0].main).toBe(true);
  });

  it('should parse form commands with modifiesStoredData', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);

    expect(model.commands).toBeDefined();
    expect(model.commands!.length).toBe(1);
    expect(model.commands![0].name).toBe('Обновить');
    expect(model.commands![0].modifiesStoredData).toBe(false);
  });
});

describe('Form.form Parser — Error handling', () => {
  it('should handle malformed XML', () => {
    const { diagnostics } = parseFormFormToModel('<broken>>>>>');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe('error');
  });

  it('should handle missing root element', () => {
    const { diagnostics } = parseFormFormToModel('<?xml version="1.0"?><SomeOther/>');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('form:Form');
  });

  it('should preserve unknown element types', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<form:Form xmlns:form="http://g5.1c.ru/v8/dt/form" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <items xsi:type="form:FutureType">
    <name>Новый</name>
    <id>99</id>
    <type>FutureKind</type>
  </items>
</form:Form>`;

    const { model, diagnostics } = parseFormFormToModel(xml);
    expect(model.form.children.length).toBe(1);
    expect(model.form.children[0].kind).toBe('unknown');
    expect(diagnostics.some((d) => d.message.includes('Unknown element'))).toBe(true);
  });
});
