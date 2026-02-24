import { describe, it, expect } from 'vitest';
import {
  walkFormTree,
  findNodeByInternalId,
  findNodeByXmlId,
  buildNodeIndex,
  collectAllXmlIds,
  generateNewXmlId,
  findParent,
} from '../src/model/node-utils';
import { parseXmlToModel } from '../src/parser/xml-parser';

const NESTED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="utils-test">
  <n>ТестУтилит</n>
  <elements xsi:type="FormGroup" id="1" name="Группа">
    <kind>UsualGroup</kind>
    <elements xsi:type="FormField" id="2" name="ВложенноеПоле">
      <kind>InputField</kind>
    </elements>
  </elements>
  <elements xsi:type="FormField" id="3" name="ПолеВерхнее">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

describe('Node Utils', () => {
  it('walkFormTree should visit all nodes', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const visited: string[] = [];
    walkFormTree(model.form, (node) => visited.push(node.name));

    expect(visited).toContain('Группа');
    expect(visited).toContain('ВложенноеПоле');
    expect(visited).toContain('ПолеВерхнее');
    expect(visited.length).toBe(3);
  });

  it('findNodeByInternalId should find nested nodes', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const nested = group.children[0];
      const found = findNodeByInternalId(model.form, nested.id.internalId);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('ВложенноеПоле');
    }
  });

  it('findNodeByXmlId should find nodes by XML id', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const found = findNodeByXmlId(model.form, '3');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('ПолеВерхнее');
  });

  it('buildNodeIndex should index all nodes', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const index = buildNodeIndex(model.form);
    expect(index.size).toBe(3);
  });

  it('collectAllXmlIds should collect all ids', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const ids = collectAllXmlIds(model);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).toContain('3');
  });

  it('generateNewXmlId should return max + 1', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const newId = generateNewXmlId(model);
    expect(newId).toBe('4');
  });

  it('findParent should find parent of a node', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const topField = model.form.children[1];
    const result = findParent(model.form, topField.id.internalId);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
  });

  it('findParent should find parent of nested node', () => {
    const { model } = parseXmlToModel(NESTED_XML);
    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const nested = group.children[0];
      const result = findParent(model.form, nested.id.internalId);
      expect(result).not.toBeNull();
      expect(result!.index).toBe(0);
    }
  });
});
