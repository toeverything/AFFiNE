import { signal } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';

import type { DataSource } from '../core/data-source/base.js';
import { t } from '../core/logical/type-presets.js';
import type { PropertyModel } from '../core/property/property-config.js';
import { checkboxPropertyModelConfig } from '../property-presets/checkbox/define.js';
import { datePropertyModelConfig } from '../property-presets/date/define.js';
import {
  formulaCellValueGet,
  FormulaErrorValue,
  formulaToDisplay,
  formulaToStorage,
} from '../property-presets/formula/cell-value.js';
import { formulaPropertyModelConfig } from '../property-presets/formula/define.js';
import { multiSelectPropertyModelConfig } from '../property-presets/multi-select/define.js';
import { numberPropertyModelConfig } from '../property-presets/number/define.js';
import { selectPropertyModelConfig } from '../property-presets/select/define.js';
import { textPropertyModelConfig } from '../property-presets/text/define.js';

const models: Record<string, PropertyModel<string, any, any, any>> = {
  checkbox: checkboxPropertyModelConfig,
  date: datePropertyModelConfig,
  formula: formulaPropertyModelConfig,
  'multi-select': multiSelectPropertyModelConfig,
  number: numberPropertyModelConfig,
  select: selectPropertyModelConfig,
  text: textPropertyModelConfig,
};

type Column = {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
};

const options = [
  { id: 'opt-todo', value: 'Todo', color: 'red' },
  { id: 'opt-done', value: 'Done', color: 'green' },
];

const createDataSource = (
  columns: Column[],
  cells: Record<string, Record<string, unknown>>
) => {
  const columns$ = signal(columns);
  const column = (id: string) => columns$.value.find(c => c.id === id);
  const dataSource = {
    properties$: signal(columns.map(c => c.id)),
    propertyNameGet: (id: string) => column(id)?.name ?? '',
    propertyTypeGet: (id: string) => column(id)?.type,
    propertyDataGet: (id: string) => column(id)?.data ?? {},
    propertyMetaGet: (type: string) => {
      const model = models[type];
      return model ? { type, config: model.config } : undefined;
    },
    propertyDataTypeGet: (id: string) => {
      const c = column(id);
      return c
        ? models[c.type]?.config.jsonValue.type({
            data: c.data,
            dataSource: dataSource as unknown as DataSource,
          })
        : undefined;
    },
    cellValueGet: (rowId: string, id: string): unknown => {
      const c = column(id);
      if (c?.type === 'formula') {
        return formulaCellValueGet(
          dataSource as unknown as DataSource,
          rowId,
          id
        );
      }
      return cells[rowId]?.[id] ?? null;
    },
  };
  const rename = (id: string, name: string) => {
    columns$.value = columns$.value.map(c =>
      c.id === id ? { ...c, name } : c
    );
  };
  return { dataSource: dataSource as unknown as DataSource, rename };
};

const formula = (id: string, name: string, expression: string): Column => ({
  id,
  name,
  type: 'formula',
  data: { expression },
});

const baseColumns: Column[] = [
  { id: 'price', name: 'Price', type: 'number', data: {} },
  { id: 'qty', name: 'Qty', type: 'number', data: {} },
  { id: 'name', name: 'Name', type: 'text', data: {} },
  { id: 'status', name: 'Status', type: 'select', data: { options } },
  { id: 'tags', name: 'Tags', type: 'multi-select', data: { options } },
  { id: 'due', name: 'Due', type: 'date', data: {} },
  { id: 'done', name: 'Done', type: 'checkbox', data: {} },
];

const row = {
  price: 2.5,
  qty: 4,
  name: 'Tea',
  status: 'opt-done',
  tags: ['opt-todo', 'opt-done'],
  due: new Date(2026, 9, 1).getTime(),
  done: true,
};

describe('formula property', () => {
  it('computes values from other properties', () => {
    const { dataSource } = createDataSource(
      [
        ...baseColumns,
        formula('total', 'Total', 'prop("price") * prop("qty")'),
        formula('label', 'Label', 'prop("Name") + " is " + prop("Status")'),
        formula('tagList', 'Tag list', 'join(prop("Tags"), "+")'),
        formula('month', 'Month', 'month(prop("Due"))'),
        formula('flag', 'Flag', 'if(prop("Done"), "yes", "no")'),
      ],
      { r1: row }
    );
    const value = (id: string) => formulaCellValueGet(dataSource, 'r1', id);
    expect(value('total')).toBe(10);
    expect(value('label')).toBe('Tea is Done');
    expect(value('tagList')).toBe('Todo+Done');
    expect(value('month')).toBe(10);
    expect(value('flag')).toBe('yes');
  });

  it('references other formulas and detects cycles', () => {
    const { dataSource } = createDataSource(
      [
        ...baseColumns,
        formula('total', 'Total', 'prop("price") * prop("qty")'),
        formula('taxed', 'Taxed', 'prop("total") * 1.1'),
        formula('a', 'A', 'prop("b") + 1'),
        formula('b', 'B', 'prop("a") + 1'),
        formula('self', 'Self', 'prop("self")'),
        formula('broken', 'Broken', '1 +'),
        formula('usesBroken', 'Uses broken', 'prop("broken")'),
      ],
      { r1: row }
    );
    const value = (id: string) => formulaCellValueGet(dataSource, 'r1', id);
    expect(value('taxed')).toBeCloseTo(11);
    expect(value('a')).toEqual(new FormulaErrorValue('Circular reference'));
    expect(value('self')).toEqual(new FormulaErrorValue('Circular reference'));
    expect(value('broken')).toBeInstanceOf(FormulaErrorValue);
    expect(value('usesBroken')).toEqual(
      new FormulaErrorValue('Property "Broken" has an error')
    );
  });

  it('reports unknown properties', () => {
    const { dataSource } = createDataSource(
      [...baseColumns, formula('f', 'F', 'prop("Missing") + 1')],
      { r1: row }
    );
    expect(formulaCellValueGet(dataSource, 'r1', 'f')).toEqual(
      new FormulaErrorValue('Unknown property "Missing"')
    );
  });

  it('stores property ids so renames keep working', () => {
    const { dataSource, rename } = createDataSource(
      [...baseColumns, formula('total', 'Total', '')],
      { r1: row }
    );
    const stored = formulaToStorage(dataSource, 'prop("Price") * prop("Qty")');
    expect(stored).toBe('prop("price") * prop("qty")');
    rename('price', 'Unit price');
    expect(formulaToDisplay(dataSource, stored)).toBe(
      'prop("Unit price") * prop("Qty")'
    );
  });

  it('infers the json type used for sorting and filtering', () => {
    const { dataSource } = createDataSource(
      [
        ...baseColumns,
        formula('total', 'Total', 'prop("price") * prop("qty")'),
        formula('taxed', 'Taxed', 'prop("total") * 1.1'),
        formula('due2', 'Due 2', 'dateAdd(prop("due"), 1, "day")'),
        formula('mixed', 'Mixed', 'if(prop("done"), 1, "a")'),
        formula('loop', 'Loop', 'prop("loop")'),
      ],
      { r1: row }
    );
    const type = (id: string) => dataSource.propertyDataTypeGet(id)?.name;
    expect(type('total')).toBe(t.number.instance().name);
    expect(type('taxed')).toBe(t.number.instance().name);
    expect(type('due2')).toBe(t.date.instance().name);
    expect(type('mixed')).toBe(t.unknown.instance().name);
    expect(type('loop')).toBe(t.unknown.instance().name);
  });

  it('converts results to json values', () => {
    const toJson = formulaPropertyModelConfig.config.rawValue.toJson;
    const { dataSource } = createDataSource(baseColumns, {});
    const json = (value: unknown) =>
      toJson({
        value: value as never,
        data: { expression: '' },
        dataSource,
      });
    expect(json(0.1 + 0.2)).toBe(0.3);
    expect(json(new Date(5))).toBe(5);
    expect(json(['a', 'b'])).toBe('a, b');
    expect(json(new FormulaErrorValue('x'))).toBe(null);
    expect(json(null)).toBe(null);
  });
});
