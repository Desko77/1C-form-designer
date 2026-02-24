import { describe, it, expect } from 'vitest';
import { CommandEngine } from '../src/commands/command-engine';
import type { FormPatch } from '../src/commands/command-engine';
import { parseXmlToModel } from '../src/parser/xml-parser';
import type { FieldNode } from '../src/model/form-model';
import { randomUUID } from 'crypto';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="cmd-test-form">
  <n>ТестоваяФорма</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Поле2">
    <kind>InputField</kind>
  </elements>
</mdclass:ManagedForm>`;

describe('CommandEngine', () => {
  it('should apply setProp patch', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const nodeId = model.form.children[0].id.internalId;
    const patch: FormPatch = {
      op: 'setProp',
      nodeId,
      propPath: 'caption',
      value: { value: 'New Caption' },
    };

    const result = engine.apply(model, patch);
    expect(result.model.form.children[0].caption?.value).toBe('New Caption');
  });

  it('should support undo', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const nodeId = model.form.children[0].id.internalId;
    const patch: FormPatch = {
      op: 'setProp',
      nodeId,
      propPath: 'name',
      value: 'ИзменённоеПоле',
    };

    const result = engine.apply(model, patch);
    expect(result.model.form.children[0].name).toBe('ИзменённоеПоле');
    expect(engine.canUndo).toBe(true);

    const undoResult = engine.undo(result.model);
    expect(undoResult).not.toBeNull();
    expect(undoResult!.model.form.children[0].name).toBe('Поле1');
  });

  it('should support redo', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const nodeId = model.form.children[0].id.internalId;
    const patch: FormPatch = {
      op: 'setProp',
      nodeId,
      propPath: 'name',
      value: 'ИзменённоеПоле',
    };

    const result1 = engine.apply(model, patch);
    const result2 = engine.undo(result1.model);
    expect(engine.canRedo).toBe(true);

    const result3 = engine.redo(result2!.model);
    expect(result3).not.toBeNull();
    expect(result3!.model.form.children[0].name).toBe('ИзменённоеПоле');
  });

  it('should apply addNode patch', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const newNode: FieldNode = {
      id: { xmlId: '99', internalId: randomUUID() },
      kind: 'field',
      name: 'НовоеПоле',
      fieldType: 'input',
    };

    const patch: FormPatch = {
      op: 'addNode',
      parentId: model.form.id.internalId,
      node: newNode,
    };

    const result = engine.apply(model, patch);
    expect(result.model.form.children.length).toBe(3);
    expect(result.model.form.children[2].name).toBe('НовоеПоле');
  });

  it('should apply removeNode patch', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const nodeId = model.form.children[0].id.internalId;
    const patch: FormPatch = { op: 'removeNode', nodeId };

    const result = engine.apply(model, patch);
    expect(result.model.form.children.length).toBe(1);
    expect(result.model.form.children[0].name).toBe('Поле2');
  });

  it('should undo removeNode (restoring the element)', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const removedName = model.form.children[0].name;
    const nodeId = model.form.children[0].id.internalId;
    const result = engine.apply(model, { op: 'removeNode', nodeId });

    expect(result.model.form.children.length).toBe(1);

    const undoResult = engine.undo(result.model);
    expect(undoResult!.model.form.children.length).toBe(2);
    expect(undoResult!.model.form.children[0].name).toBe(removedName);
  });

  it('should apply moveNode patch', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const nodeId = model.form.children[0].id.internalId;
    const patch: FormPatch = {
      op: 'moveNode',
      nodeId,
      newParentId: model.form.id.internalId,
      index: 1,
    };

    const result = engine.apply(model, patch);
    expect(result.model.form.children[0].name).toBe('Поле2');
    expect(result.model.form.children[1].name).toBe('Поле1');
  });

  it('should respect maxSize limit', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine(5);
    const nodeId = model.form.children[0].id.internalId;

    let currentModel = model;
    for (let i = 0; i < 10; i++) {
      const result = engine.apply(currentModel, {
        op: 'setProp',
        nodeId,
        propPath: 'name',
        value: `Имя_${i}`,
      });
      currentModel = result.model;
      // Sleep to avoid coalescing
    }

    expect(engine.stackSize).toBeLessThanOrEqual(5);
  });

  it('should truncate redo stack on new operation', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();
    const nodeId = model.form.children[0].id.internalId;

    const r1 = engine.apply(model, { op: 'setProp', nodeId, propPath: 'name', value: 'A' });
    const r2 = engine.apply(r1.model, { op: 'setProp', nodeId, propPath: 'name', value: 'B' });

    // Undo to go back
    const r3 = engine.undo(r2.model);
    expect(engine.canRedo).toBe(true);

    // New operation should truncate redo
    engine.apply(r3!.model, { op: 'setProp', nodeId, propPath: 'name', value: 'C' });
    expect(engine.canRedo).toBe(false);
  });

  it('should apply batch patches', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const engine = new CommandEngine();

    const id1 = model.form.children[0].id.internalId;
    const id2 = model.form.children[1].id.internalId;

    const batch: FormPatch = {
      op: 'batch',
      patches: [
        { op: 'setProp', nodeId: id1, propPath: 'name', value: 'A' },
        { op: 'setProp', nodeId: id2, propPath: 'name', value: 'B' },
      ],
    };

    const result = engine.apply(model, batch);
    expect(result.model.form.children[0].name).toBe('A');
    expect(result.model.form.children[1].name).toBe('B');
  });
});
