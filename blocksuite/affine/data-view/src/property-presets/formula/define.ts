import zod from 'zod';

import { propertyType } from '../../core/property/property-config.js';
import {
  FORMULA_PROPERTY_TYPE,
  formulaCellToJson,
  formulaCellToText,
  type FormulaCellValue,
  type FormulaPropertyData,
  formulaTypeToTypeInstance,
  getFormulaExpression,
  inferFormulaResultType,
} from './cell-value.js';

export const formulaPropertyType = propertyType(FORMULA_PROPERTY_TYPE);

export const FormulaPropertySchema = zod.object({
  expression: zod.string(),
});

export const formulaPropertyModelConfig = formulaPropertyType.modelConfig<
  FormulaPropertyData,
  FormulaCellValue,
  number | string | boolean | null
>({
  name: 'Formula',
  propertyData: {
    schema: FormulaPropertySchema,
    default: () => ({ expression: '' }),
  },
  jsonValue: {
    schema: zod.union([zod.number(), zod.string(), zod.boolean()]).nullable(),
    isEmpty: ({ value }) => value == null || value === '',
    type: ({ data, dataSource }) =>
      formulaTypeToTypeInstance(
        inferFormulaResultType(dataSource, getFormulaExpression(data))
      ),
  },
  rawValue: {
    // Values are calculated by the data source and never stored.
    schema: zod.custom<FormulaCellValue>(() => true),
    default: () => null,
    toString: ({ value }) => formulaCellToText(value),
    fromString: () => ({ value: null }),
    toJson: ({ value }) => formulaCellToJson(value),
    fromJson: () => null,
    setValue: () => {},
  },
});
