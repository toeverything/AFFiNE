import { describe, expect, it } from 'vitest';

import {
  collectPropertyRefs,
  compileFormula,
  evaluateFormula,
  type FormulaType,
  type FormulaValue,
  inferFormulaType,
  rewritePropertyRefs,
} from '../property-presets/formula/engine/index.js';

const NOW = new Date(2026, 8, 25, 13, 45, 0);

const run = (
  source: string,
  props: Record<string, FormulaValue> = {}
): FormulaValue => {
  const compiled = compileFormula(source);
  if (!compiled.ok) {
    throw new Error(`compile error: ${compiled.error.message}`);
  }
  const result = evaluateFormula(compiled.ast, {
    property: ref => {
      if (!(ref in props)) {
        throw new Error(`missing test prop ${ref}`);
      }
      return props[ref] as FormulaValue;
    },
    now: () => NOW,
  });
  if (!result.ok) {
    throw new Error(`runtime error: ${result.error}`);
  }
  return result.value;
};

const runtimeError = (
  source: string,
  props: Record<string, FormulaValue> = {}
) => {
  const compiled = compileFormula(source);
  if (!compiled.ok) throw new Error(compiled.error.message);
  const result = evaluateFormula(compiled.ast, {
    property: ref => props[ref] ?? null,
    now: () => NOW,
  });
  return result.ok ? undefined : result.error;
};

const compileError = (source: string) => {
  const compiled = compileFormula(source);
  return compiled.ok ? undefined : compiled.error;
};

describe('formula parser', () => {
  it('respects operator precedence', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('2 ^ 3 ^ 2')).toBe(512);
    expect(run('-2 ^ 2')).toBe(-4);
    expect(run('2 ^ -1')).toBe(0.5);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('7 % 4')).toBe(3);
    expect(run('1 + 2 > 2 and 3 < 4')).toBe(true);
    expect(run('true or false and false')).toBe(true);
  });

  it('parses literals', () => {
    expect(run('.5 + 1e2')).toBe(100.5);
    expect(run('"a\\"b"')).toBe('a"b');
    expect(run("'it\\'s'")).toBe("it's");
    expect(run('"a\\nb"')).toBe('a\nb');
    expect(run('“smart”')).toBe('smart');
    expect(run('[1, "a", true]')).toEqual([1, 'a', true]);
    expect(run('pi > 3.14 and e < 2.72')).toBe(true);
    expect(run('TRUE')).toBe(true);
  });

  it('supports the ternary and not operators', () => {
    expect(run('1 > 2 ? "yes" : "no"')).toBe('no');
    expect(run('not true')).toBe(false);
    expect(run('!false')).toBe(true);
    expect(run('not(1 == 1)')).toBe(false);
    expect(run('true ? 1 : false ? 2 : 3')).toBe(1);
  });

  it('reports syntax errors with positions', () => {
    expect(compileError('1 +')).toMatchObject({
      message: expect.stringContaining('Unexpected end'),
    });
    expect(compileError('"abc')).toMatchObject({
      message: 'Unterminated text',
      start: 0,
    });
    expect(compileError('1 $ 2')).toMatchObject({ start: 2, end: 3 });
    expect(compileError('price * 2')?.message).toContain('prop("price")');
    expect(compileError('prop(1)')?.message).toContain('property name');
    expect(compileError('foo(1)')?.message).toBe('Unknown function "foo"');
    expect(compileError('round()')?.message).toContain('round(number');
    expect(compileError('(1')?.message).toContain('Expected ")"');
    expect(compileError('1 ? 2')?.message).toContain('Expected ":"');
  });

  it('limits nesting depth', () => {
    expect(compileError('('.repeat(200) + '1' + ')'.repeat(200))?.message).toBe(
      'Formula is nested too deeply'
    );
    expect(compileError('-'.repeat(200) + '1')?.message).toBe(
      'Formula is nested too deeply'
    );
  });
});

describe('formula evaluation', () => {
  it('reads properties', () => {
    expect(run('prop("Price") * prop("Qty")', { Price: 2.5, Qty: 4 })).toBe(10);
    expect(
      run('prop("Name") + " (" + prop("Qty") + ")"', { Name: 'Tea', Qty: 3 })
    ).toBe('Tea (3)');
  });

  it('treats empty values like zero next to a value', () => {
    expect(run('prop("A") + prop("B")', { A: null, B: null })).toBe(null);
    expect(run('prop("A") + 3', { A: null })).toBe(3);
    expect(run('prop("A") - 3', { A: null })).toBe(-3);
    expect(run('prop("A") * 3', { A: null })).toBe(null);
    expect(run('10 / prop("A")', { A: null })).toBe(null);
    expect(run('2 ^ prop("A")', { A: null })).toBe(null);
    expect(run('"x" + prop("A")', { A: null })).toBe('x');
    expect(run('-prop("A")', { A: null })).toBe(null);
  });

  it('strips floating point noise when converting to text', () => {
    expect(run('format(0.1 + 0.2)')).toBe('0.3');
    expect(run('0.1 + 0.2 == 0.3')).toBe(true);
  });

  it('reports runtime errors', () => {
    expect(runtimeError('1 / 0')).toBe('Division by zero');
    expect(runtimeError('mod(1, 0)')).toBe('Division by zero');
    expect(runtimeError('sqrt(-1)')).toBe('The result is not a valid number');
    expect(runtimeError('1 < "a"')).toBe('Cannot compare a number with text');
    expect(runtimeError('true * 2')).toContain('expects a number');
    expect(runtimeError('repeat("ab", 100000)')).toBe('Text is too long');
    expect(runtimeError('dateAdd(now(), 1, "fortnight")')).toContain(
      'expects a unit'
    );
  });

  it('short circuits logic', () => {
    expect(run('false and 1 / 0')).toBe(false);
    expect(run('true or 1 / 0')).toBe(true);
    expect(run('if(true, 1, 1 / 0)')).toBe(1);
    expect(run('if(false, 1)')).toBe(null);
    expect(run('ifs(false, 1, true, 2, 1 / 0)')).toBe(2);
    expect(run('ifs(false, 1, "fallback")')).toBe('fallback');
    expect(run('ifs(false, 1)')).toBe(null);
    expect(run('and(true, 1, "x")')).toBe(true);
    expect(run('or(false, 0, "")')).toBe(false);
  });

  it('compares values', () => {
    expect(run('"a" < "b"')).toBe(true);
    expect(run('prop("A") < 1', { A: null })).toBe(false);
    expect(run('[1, 2] == [1, 2]')).toBe(true);
    expect(run('1 != "1"')).toBe(true);
    expect(run('1 = 1')).toBe(true);
    expect(run('equal(today(), today())')).toBe(true);
  });

  it('has math functions', () => {
    expect(run('round(2.345, 2)')).toBe(2.35);
    expect(run('round(-2.5)')).toBe(-3);
    expect(run('round(prop("A"))', { A: null })).toBe(null);
    expect(run('abs(-3) + ceil(1.2) + floor(1.8)')).toBe(6);
    expect(run('min(3, prop("A"), [1, 2])', { A: null })).toBe(1);
    expect(run('max(3, 7, 5)')).toBe(7);
    expect(run('sum([1, 2, 3], 4)')).toBe(10);
    expect(run('average(2, 4, prop("A"))', { A: null })).toBe(3);
    expect(run('average(prop("A"))', { A: null })).toBe(null);
    expect(run('toNumber("1,234.5")')).toBe(1234.5);
    expect(run('toNumber("abc")')).toBe(null);
    expect(run('toNumber(true)')).toBe(1);
    expect(run('pow(2, 10) + sign(-4)')).toBe(1023);
  });

  it('has text functions', () => {
    expect(run('concat("a", 1, true)')).toBe('a1true');
    expect(run('length("héllo")')).toBe(5);
    expect(run('length(prop("Tags"))', { Tags: ['a', 'b'] })).toBe(2);
    expect(run('upper("ab") + lower("CD") + trim("  x ")')).toBe('ABcdx');
    expect(run('contains("hello", "ell")')).toBe(true);
    expect(run('contains(prop("Tags"), "b")', { Tags: ['a', 'b'] })).toBe(true);
    expect(run('replace("a.b.c", ".", "-")')).toBe('a-b-c');
    expect(run('slice("hello", 1, 3)')).toBe('el');
    expect(run('slice("hello", -2)')).toBe('lo');
    expect(run('startsWith("hello", "he") and endsWith("hello", "lo")')).toBe(
      true
    );
    expect(run('repeat("ab", 2)')).toBe('abab');
    expect(run('join(prop("Tags"), " / ")', { Tags: ['a', 'b'] })).toBe(
      'a / b'
    );
    expect(run('format(prop("Tags"))', { Tags: ['a', 'b'] })).toBe('a, b');
    expect(run('empty("") and not empty("x")')).toBe(true);
  });

  it('has date functions', () => {
    const due = new Date(2026, 9, 1);
    expect(run('today()')).toEqual(new Date(2026, 8, 25));
    expect(run('now()')).toEqual(NOW);
    expect(run('dateAdd(prop("Due"), 2, "weeks")', { Due: due })).toEqual(
      new Date(2026, 9, 15)
    );
    expect(run('dateSubtract(prop("Due"), 1, "month")', { Due: due })).toEqual(
      new Date(2026, 8, 1)
    );
    expect(run('dateAdd(prop("Due"), 1.5, "hours")', { Due: due })).toEqual(
      new Date(2026, 9, 1, 1, 30)
    );
    expect(run('dateBetween(prop("Due"), today(), "days")', { Due: due })).toBe(
      6
    );
    expect(
      run('dateBetween(prop("Due"), prop("X"), "days")', {
        Due: due,
        X: null,
      })
    ).toBe(null);
    expect(run('formatDate(prop("Due"), "yyyy-MM-dd")', { Due: due })).toBe(
      '2026-10-01'
    );
    expect(run('year(now()) * 100 + month(now())')).toBe(202609);
    expect(run('day(now()) + hour(now()) + minute(now())')).toBe(25 + 13 + 45);
    expect(run('weekday(prop("Due"))', { Due: due })).toBe(4);
    expect(run('fromTimestamp(timestamp(prop("Due")))', { Due: due })).toEqual(
      due
    );
    expect(run('prop("Due") > now()', { Due: due })).toBe(true);
    expect(run('format(prop("Due"))', { Due: due })).toBe('2026/10/01');
    expect(runtimeError('formatDate(now(), "YYYY")')).toContain('pattern');
  });
});

describe('formula analysis', () => {
  const types: Record<string, FormulaType> = {
    Price: 'number',
    Name: 'text',
    Done: 'boolean',
    Due: 'date',
    Tags: 'list',
  };
  const infer = (source: string) => {
    const compiled = compileFormula(source);
    if (!compiled.ok) throw new Error(compiled.error.message);
    return inferFormulaType(compiled.ast, ref => types[ref] ?? 'unknown');
  };

  it('infers result types', () => {
    expect(infer('prop("Price") * 2')).toBe('number');
    expect(infer('prop("Name") + prop("Price")')).toBe('text');
    expect(infer('prop("Price") + prop("Unknown")')).toBe('unknown');
    expect(infer('prop("Done") and true')).toBe('boolean');
    expect(infer('dateAdd(prop("Due"), 1, "day")')).toBe('date');
    expect(infer('if(prop("Done"), 1, 2)')).toBe('number');
    expect(infer('if(prop("Done"), 1, "a")')).toBe('unknown');
    expect(infer('ifs(prop("Done"), "a", false, "b", "c")')).toBe('text');
    expect(infer('prop("Done") ? prop("Due") : today()')).toBe('date');
    expect(infer('prop("Tags")')).toBe('list');
    expect(infer('length(prop("Tags"))')).toBe('number');
  });

  it('collects property references', () => {
    const compiled = compileFormula(
      'prop("A") + prop("B") * if(prop("A") > 1, prop("C"), 0)'
    );
    if (!compiled.ok) throw new Error('compile error');
    expect(collectPropertyRefs(compiled.ast)).toEqual(['A', 'B', 'C']);
  });

  it('rewrites property references without touching other text', () => {
    const ids: Record<string, string> = { Price: 'p1', 'Say "hi"': 'q2' };
    expect(
      rewritePropertyRefs(
        'prop("Price") *  2 + prop( "Say \\"hi\\"" ) + "prop(\\"Price\\")"',
        name => ids[name] ?? name
      )
    ).toBe('prop("p1") *  2 + prop( "q2" ) + "prop(\\"Price\\")"');
    expect(rewritePropertyRefs('prop("p1")', id => `Say "${id}"`)).toBe(
      'prop("Say \\"p1\\"")'
    );
    expect(rewritePropertyRefs('prop("Missing")', ref => ref)).toBe(
      'prop("Missing")'
    );
    expect(rewritePropertyRefs('prop("unterminated', () => 'x')).toBe(
      'prop("unterminated'
    );
  });
});
