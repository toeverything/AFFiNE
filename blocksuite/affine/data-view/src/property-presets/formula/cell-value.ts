import type { DataSource } from '../../core/data-source/base.js';
import type { TypeInstance } from '../../core/logical/type.js';
import { t } from '../../core/logical/type-presets.js';
import {
  compileFormulaCached,
  evaluateFormula,
  type FormulaCompileResult,
  FormulaRuntimeError,
  type FormulaType,
  type FormulaValue,
  inferFormulaType,
  normalizeNumber,
  rewritePropertyRefs,
  valueToText,
} from './engine/index.js';

export const FORMULA_PROPERTY_TYPE = 'formula';

export class FormulaErrorValue {
  constructor(readonly message: string) {}
}

export type FormulaCellValue = FormulaValue | FormulaErrorValue;

export type FormulaPropertyData = {
  expression: string;
};

const CIRCULAR_REFERENCE = 'Circular reference';

export const getFormulaExpression = (data: unknown): string => {
  const expression = (data as Partial<FormulaPropertyData> | undefined)
    ?.expression;
  return typeof expression === 'string' ? expression : '';
};

export const resolveFormulaPropertyId = (
  dataSource: DataSource,
  ref: string
): string | undefined => {
  const ids = dataSource.properties$.value;
  if (ids.includes(ref)) return ref;
  const byName = ids.find(id => dataSource.propertyNameGet(id) === ref);
  if (byName) return byName;
  const lower = ref.toLowerCase();
  return ids.find(id => dataSource.propertyNameGet(id).toLowerCase() === lower);
};

/**
 * Formulas are stored with property ids, but shown and edited with names.
 */
export const formulaToDisplay = (dataSource: DataSource, expression: string) =>
  rewritePropertyRefs(expression, ref => {
    const id = resolveFormulaPropertyId(dataSource, ref);
    return id ? dataSource.propertyNameGet(id) : ref;
  });

export const formulaToStorage = (dataSource: DataSource, expression: string) =>
  rewritePropertyRefs(
    expression,
    ref => resolveFormulaPropertyId(dataSource, ref) ?? ref
  );

const tagLabel = (type: TypeInstance, id: unknown): string => {
  const options = t.tag.is(type) ? type.data : undefined;
  return options?.find(option => option.id === id)?.value ?? String(id);
};

const jsonToFormulaValue = (
  json: unknown,
  type: TypeInstance | undefined
): FormulaValue => {
  if (json == null) return null;
  if (type && t.tag.is(type)) return tagLabel(type, json);
  if (type && t.array.is(type)) {
    return Array.isArray(json)
      ? json.map(item => jsonToFormulaValue(item, type.element))
      : null;
  }
  if (type && t.date.is(type)) {
    return typeof json === 'number' ? new Date(json) : null;
  }
  if (
    typeof json === 'number' ||
    typeof json === 'string' ||
    typeof json === 'boolean'
  ) {
    return json;
  }
  if (Array.isArray(json)) {
    return json.map(item => jsonToFormulaValue(item, undefined));
  }
  return null;
};

const typeInstanceToFormulaType = (type?: TypeInstance): FormulaType => {
  if (!type) return 'unknown';
  if (t.number.is(type)) return 'number';
  if (t.boolean.is(type)) return 'boolean';
  if (t.date.is(type)) return 'date';
  if (t.array.is(type)) return 'list';
  if (
    t.string.is(type) ||
    t.richText.is(type) ||
    t.url.is(type) ||
    t.tag.is(type) ||
    t.image.is(type) ||
    t.user.is(type)
  ) {
    return 'text';
  }
  return 'unknown';
};

export const formulaTypeToTypeInstance = (type: FormulaType): TypeInstance => {
  switch (type) {
    case 'number':
      return t.number.instance();
    case 'boolean':
      return t.boolean.instance();
    case 'date':
      return t.date.instance();
    case 'text':
    case 'list':
      return t.string.instance();
    default:
      return t.unknown.instance();
  }
};

// Guards against formulas that reference each other.
const evaluating = new Set<string>();
const inferring = new Set<string>();

const inferFromCompiled = (
  dataSource: DataSource,
  compiled: FormulaCompileResult
): FormulaType => {
  if (!compiled.ok) return 'unknown';
  return inferFormulaType(compiled.ast, ref => {
    const id = resolveFormulaPropertyId(dataSource, ref);
    if (!id) return 'unknown';
    if (dataSource.propertyTypeGet(id) !== FORMULA_PROPERTY_TYPE) {
      return typeInstanceToFormulaType(dataSource.propertyDataTypeGet(id));
    }
    if (inferring.has(id)) return 'unknown';
    inferring.add(id);
    try {
      return inferFormulaResultType(
        dataSource,
        getFormulaExpression(dataSource.propertyDataGet(id))
      );
    } finally {
      inferring.delete(id);
    }
  });
};

export const inferFormulaResultType = (
  dataSource: DataSource,
  expression: string
): FormulaType => {
  if (!expression.trim()) return 'unknown';
  return inferFromCompiled(dataSource, compileFormulaCached(expression));
};

const readProperty = (
  dataSource: DataSource,
  rowId: string,
  ref: string
): FormulaValue => {
  const id = resolveFormulaPropertyId(dataSource, ref);
  if (!id) {
    throw new FormulaRuntimeError(`Unknown property "${ref}"`);
  }
  const type = dataSource.propertyTypeGet(id);
  const value = dataSource.cellValueGet(rowId, id);
  if (type === FORMULA_PROPERTY_TYPE) {
    if (value instanceof FormulaErrorValue) {
      throw new FormulaRuntimeError(
        value.message === CIRCULAR_REFERENCE
          ? CIRCULAR_REFERENCE
          : `Property "${dataSource.propertyNameGet(id)}" has an error`
      );
    }
    return (value ?? null) as FormulaValue;
  }
  const meta = type ? dataSource.propertyMetaGet(type) : undefined;
  if (!meta) return null;
  const json = meta.config.rawValue.toJson({
    value,
    data: dataSource.propertyDataGet(id),
    dataSource,
  });
  return jsonToFormulaValue(json, dataSource.propertyDataTypeGet(id));
};

/**
 * Evaluates `expression` for a row. `propertyId` is the formula property
 * being calculated, used to detect circular references. It may be omitted
 * to preview an expression that isn't saved yet.
 */
export const evaluateFormulaForRow = (
  dataSource: DataSource,
  rowId: string,
  expression: string,
  propertyId?: string
): FormulaCellValue => {
  if (!expression.trim()) return null;
  const compiled = compileFormulaCached(expression);
  if (!compiled.ok) return new FormulaErrorValue(compiled.error.message);
  const key = propertyId ? `${rowId}:${propertyId}` : undefined;
  if (key) {
    if (evaluating.has(key)) return new FormulaErrorValue(CIRCULAR_REFERENCE);
    evaluating.add(key);
  }
  try {
    const result = evaluateFormula(compiled.ast, {
      property: ref => readProperty(dataSource, rowId, ref),
      now: () => new Date(),
    });
    return result.ok ? result.value : new FormulaErrorValue(result.error);
  } finally {
    if (key) evaluating.delete(key);
  }
};

export const formulaCellValueGet = (
  dataSource: DataSource,
  rowId: string,
  propertyId: string
): FormulaCellValue =>
  evaluateFormulaForRow(
    dataSource,
    rowId,
    getFormulaExpression(dataSource.propertyDataGet(propertyId)),
    propertyId
  );

export const formulaCellToJson = (
  value: FormulaCellValue | undefined
): number | string | boolean | null => {
  if (value == null || value instanceof FormulaErrorValue) return null;
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return valueToText(value);
  if (typeof value === 'number') return normalizeNumber(value);
  return value;
};

export const formulaCellToText = (value: FormulaCellValue | undefined) => {
  if (value == null) return '';
  if (value instanceof FormulaErrorValue) return '';
  return valueToText(value);
};
