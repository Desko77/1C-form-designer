import { describe, it, expect } from 'vitest';
import { LayoutEngine } from '../src/layout/layout-engine';
import { parseXmlToModel } from '../src/parser/xml-parser';
import type { Size } from '../src/layout/layout-engine';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="layout-test">
  <n>ТестLayout</n>
  <elements xsi:type="FormField" id="1" name="Поле1">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormField" id="2" name="Поле2">
    <kind>InputField</kind>
  </elements>
  <elements xsi:type="FormButton" id="3" name="Кнопка1">
    <commandName>Test</commandName>
  </elements>
</mdclass:ManagedForm>`;

const GROUPED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="grouped-layout-test">
  <n>ТестGroupLayout</n>
  <elements xsi:type="FormGroup" id="1" name="Группа1">
    <kind>UsualGroup</kind>
    <group>Vertical</group>
    <elements xsi:type="FormField" id="2" name="Поле1">
      <kind>InputField</kind>
    </elements>
    <elements xsi:type="FormField" id="3" name="Поле2">
      <kind>InputField</kind>
    </elements>
  </elements>
</mdclass:ManagedForm>`;

describe('LayoutEngine', () => {
  const engine = new LayoutEngine();
  const viewport: Size = { width: 800, height: 600 };

  it('should compute layout for simple form', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const result = engine.computeLayout(model.form, viewport);

    expect(result.boxes.size).toBeGreaterThan(0);
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.contentSize.width).toBe(viewport.width);
  });

  it('should create a LayoutBox for each visible element', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const result = engine.computeLayout(model.form, viewport);

    for (const child of model.form.children) {
      const box = result.boxes.get(child.id.internalId);
      expect(box).toBeDefined();
      expect(box!.visible).toBe(true);
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
    }
  });

  it('should stack vertical elements top-to-bottom', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const result = engine.computeLayout(model.form, viewport);

    const box1 = result.boxes.get(model.form.children[0].id.internalId)!;
    const box2 = result.boxes.get(model.form.children[1].id.internalId)!;

    // Second element should be below the first
    expect(box2.y).toBeGreaterThan(box1.y);
  });

  it('should layout grouped elements', () => {
    const { model } = parseXmlToModel(GROUPED_XML);
    const result = engine.computeLayout(model.form, viewport);

    const groupBox = result.boxes.get(model.form.children[0].id.internalId);
    expect(groupBox).toBeDefined();
    expect(groupBox!.direction).toBe('vertical');
  });

  it('should layout nested children within groups', () => {
    const { model } = parseXmlToModel(GROUPED_XML);
    const result = engine.computeLayout(model.form, viewport);

    const group = model.form.children[0];
    if (group.kind === 'usualGroup') {
      const childBox1 = result.boxes.get(group.children[0].id.internalId);
      const childBox2 = result.boxes.get(group.children[1].id.internalId);
      expect(childBox1).toBeDefined();
      expect(childBox2).toBeDefined();
      expect(childBox2!.y).toBeGreaterThan(childBox1!.y);
    }
  });

  it('should compute layout within performance budget (< 50ms for simple)', () => {
    const { model } = parseXmlToModel(SIMPLE_XML);
    const result = engine.computeLayout(model.form, viewport);

    expect(result.computeTimeMs).toBeLessThan(50);
  });

  it('should handle empty form', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="empty-test">
  <n>ПустаяФорма</n>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const result = engine.computeLayout(model.form, viewport);

    expect(result.boxes.size).toBe(0);
    expect(result.contentSize.height).toBe(viewport.height);
  });

  it('should handle pages layout', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:core="http://g5.1c.ru/v8/dt/mcore" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass"
  uuid="pages-test">
  <n>ТестСтраницы</n>
  <elements xsi:type="FormGroup" id="1" name="Страницы">
    <kind>Pages</kind>
    <elements xsi:type="FormGroup" id="2" name="Страница1">
      <kind>Page</kind>
    </elements>
    <elements xsi:type="FormGroup" id="3" name="Страница2">
      <kind>Page</kind>
    </elements>
  </elements>
</mdclass:ManagedForm>`;

    const { model } = parseXmlToModel(xml);
    const result = engine.computeLayout(model.form, viewport);

    const pages = model.form.children[0];
    const pagesBox = result.boxes.get(pages.id.internalId);
    expect(pagesBox).toBeDefined();

    // First page visible, second page hidden
    if (pages.kind === 'pages') {
      const page1Box = result.boxes.get(pages.children[0].id.internalId);
      const page2Box = result.boxes.get(pages.children[1].id.internalId);
      expect(page1Box!.visible).toBe(true);
      expect(page2Box!.visible).toBe(false);
    }
  });
});
