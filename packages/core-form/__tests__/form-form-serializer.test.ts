import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFormFormToModel } from '../src/parser/form-form-parser';
import { serializeModelToFormForm } from '../src/serializer/form-form-serializer';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const SIMPLE_FORM = readFileSync(resolve(FIXTURES_DIR, 'simple.form.form'), 'utf-8');
const COMPLEX_FORM = readFileSync(resolve(FIXTURES_DIR, 'complex.form.form'), 'utf-8');

describe('Form.form Serializer', () => {
  it('should serialize a simple model to Form.form XML', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('<form:Form');
    expect(xml).toContain('xmlns:form=');
    expect(xml).toContain('<items');
    expect(xml).toContain('xsi:type="form:FormGroup"');
    expect(xml).toContain('<name>ГруппаОсновная</name>');
    expect(xml).toContain('<type>UsualGroup</type>');
  });

  it('should use <items> instead of <elements>', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('<items');
    expect(xml).not.toContain('<elements');
  });

  it('should serialize DataPath with form:DataPath structure', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('xsi:type="form:DataPath"');
    expect(xml).toContain('<segments>Объект.Наименование</segments>');
  });

  it('should serialize handlers with <name> (not <n>)', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('<handlers>');
    expect(xml).toContain('<event>OnChange</event>');
    expect(xml).toContain('<name>НаименованиеПриИзменении</name>');
  });

  it('should serialize commands as <formCommands>', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('<formCommands>');
    expect(xml).toContain('<name>Записать</name>');
  });

  it('should serialize name and id as child elements', () => {
    const { model } = parseFormFormToModel(SIMPLE_FORM);
    const xml = serializeModelToFormForm(model);

    // Name as child element (not attribute)
    expect(xml).toContain('<name>ГруппаОсновная</name>');
    expect(xml).toContain('<id>1</id>');
  });

  it('should serialize table elements', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('xsi:type="form:FormTable"');
    expect(xml).toContain('<name>ТаблицаТовары</name>');
    expect(xml).toContain('<segments>Объект.Товары</segments>');
  });

  it('should serialize form attributes', () => {
    const { model } = parseFormFormToModel(COMPLEX_FORM);
    const xml = serializeModelToFormForm(model);

    expect(xml).toContain('<attributes>');
    expect(xml).toContain('<name>Объект</name>');
    expect(xml).toContain('<main>true</main>');
  });
});

describe('Form.form Round-trip', () => {
  it('should preserve model structure through parse → serialize → parse', () => {
    const { model: model1 } = parseFormFormToModel(SIMPLE_FORM);
    const xml2 = serializeModelToFormForm(model1);
    const { model: model2, diagnostics } = parseFormFormToModel(xml2);

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);

    // Compare structure
    expect(model2.form.children.length).toBe(model1.form.children.length);
    expect(model2.meta?.exportFormat).toBe('edt-form');

    // Compare children kinds and names
    for (let i = 0; i < model1.form.children.length; i++) {
      expect(model2.form.children[i].kind).toBe(model1.form.children[i].kind);
      expect(model2.form.children[i].name).toBe(model1.form.children[i].name);
    }

    // Compare group children
    const group1 = model1.form.children[0];
    const group2 = model2.form.children[0];
    if (group1.kind === 'usualGroup' && group2.kind === 'usualGroup') {
      expect(group2.children.length).toBe(group1.children.length);
      for (let i = 0; i < group1.children.length; i++) {
        expect(group2.children[i].kind).toBe(group1.children[i].kind);
        expect(group2.children[i].name).toBe(group1.children[i].name);
        if (group1.children[i].kind === 'field' && group2.children[i].kind === 'field') {
          expect((group2.children[i] as import('../src/model/form-model').FieldNode).dataPath)
            .toBe((group1.children[i] as import('../src/model/form-model').FieldNode).dataPath);
        }
      }
    }

    // Commands
    expect(model2.commands?.length).toBe(model1.commands?.length);
    if (model1.commands && model2.commands) {
      expect(model2.commands[0].name).toBe(model1.commands[0].name);
      expect(model2.commands[0].action).toBe(model1.commands[0].action);
    }
  });

  it('should preserve complex form through round-trip', () => {
    const { model: model1 } = parseFormFormToModel(COMPLEX_FORM);
    const xml2 = serializeModelToFormForm(model1);
    const { model: model2, diagnostics } = parseFormFormToModel(xml2);

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(model2.form.children.length).toBe(model1.form.children.length);

    // Pages
    const pages1 = model1.form.children[0];
    const pages2 = model2.form.children[0];
    if (pages1.kind === 'pages' && pages2.kind === 'pages') {
      expect(pages2.children.length).toBe(pages1.children.length);
    }

    // Table
    const table1 = model1.form.children[1];
    const table2 = model2.form.children[1];
    if (table1.kind === 'table' && table2.kind === 'table') {
      expect(table2.columns.length).toBe(table1.columns.length);
      expect(table2.dataPath).toBe(table1.dataPath);
    }

    // Attributes
    expect(model2.attributes?.length).toBe(model1.attributes?.length);
  });
});
