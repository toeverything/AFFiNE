import { createEntityDataValidators, updateEntityDataValidators } from './data';
import { tableSchemaValidators } from './schema';
import { yjsDataValidators, yjsTableSchemaValidators } from './yjs';

interface ValidationError {
  code: string;
  error: Error;
}

function throwIfError(errors: ValidationError[]) {
  if (errors.length) {
    const message = errors
      .map(({ code, error }) => `${code}: ${error.stack ?? error.message}`)
      .join('\n');

    throw new Error('Validation Failed Error\n' + message);
  }
}

function validate<Validator extends { validate: (...args: any[]) => void }>(
  rules: Record<string, Validator>,
  ...payload: Parameters<Validator['validate']>
) {
  const errors: ValidationError[] = [];

  for (const [code, validator] of Object.entries(rules)) {
    try {
      validator.validate(...payload);
    } catch (e) {
      errors.push({ code, error: e as Error });
    }
  }

  throwIfError(errors);
}

function use<Validator extends { validate: (...args: any[]) => void }>(
  rules: Record<string, Validator>
) {
  return (...payload: Parameters<Validator['validate']>) =>
    validate(rules, ...payload);
}

export const validators = {
  validateTableSchema: use(tableSchemaValidators),
  validateCreateEntityData: use(createEntityDataValidators),
  validateUpdateEntityData: use(updateEntityDataValidators),
  validateYjsTableSchema: use(yjsTableSchemaValidators),
  validateYjsEntityData: use(yjsDataValidators),
};
