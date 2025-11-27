import { generateId, MAX_ID_LENGTH } from '../src/property-presets/id';

describe('ID Property Type', () => {
  it('should generate a simple auto-increment ID', () => {
    expect(generateId(1, { padding: 3 }, undefined)).toBe('001');
    expect(generateId(12, { padding: 3 }, undefined)).toBe('012');
    expect(generateId(123, { padding: 3 }, undefined)).toBe('123');
  });

  it('should apply prefix and suffix', () => {
    expect(
      generateId(5, { prefix: 'PRJ-', suffix: '-A', padding: 2 }, undefined)
    ).toBe('PRJ-05-A');
  });

  it('should throw if prefix ends with digit', () => {
    expect(() =>
      generateId(1, { prefix: 'A1', padding: 2 }, undefined)
    ).toThrow();
  });

  it('should throw if suffix starts with digit', () => {
    expect(() =>
      generateId(1, { suffix: '1B', padding: 2 }, undefined)
    ).toThrow();
  });

  it('should throw if ID exceeds max length', () => {
    const longPrefix = 'X'.repeat(MAX_ID_LENGTH);
    expect(() =>
      generateId(1, { prefix: longPrefix, padding: 1 }, undefined)
    ).toThrow();
  });

  it('should auto-detect padding from last value', () => {
    expect(generateId(7, { padding: 'auto' }, '0007')).toBe('0007');
    expect(generateId(8, { padding: 'auto' }, '0007')).toBe('0008');
  });
});
