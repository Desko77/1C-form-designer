import { describe, it, expect } from 'vitest';
import { detectFormFormat } from '../src/parser/format-detector';

describe('Format Detector', () => {
  it('should detect form:Form format', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<form:Form xmlns:form="http://g5.1c.ru/v8/dt/form" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <items>...</items>
</form:Form>`;
    expect(detectFormFormat(xml)).toBe('form-form');
  });

  it('should detect mdclass:ManagedForm format', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mdclass:ManagedForm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:mdclass="http://g5.1c.ru/v8/dt/metadata/mdclass">
  <elements>...</elements>
</mdclass:ManagedForm>`;
    expect(detectFormFormat(xml)).toBe('mdclass');
  });

  it('should detect bare ManagedForm as mdclass', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ManagedForm xmlns="http://g5.1c.ru/v8/dt/metadata/mdclass">
  <elements>...</elements>
</ManagedForm>`;
    expect(detectFormFormat(xml)).toBe('mdclass');
  });

  it('should return unknown for unrecognized format', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><SomeOther><data/></SomeOther>`;
    expect(detectFormFormat(xml)).toBe('unknown');
  });

  it('should handle empty string', () => {
    expect(detectFormFormat('')).toBe('unknown');
  });
});
