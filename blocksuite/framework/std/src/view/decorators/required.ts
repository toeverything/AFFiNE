import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { Constructor } from '@blocksuite/global/utils';
import type { LitElement } from 'lit';

type ValidatorFunction = (value: unknown) => boolean;

export const PropTypes = {
  string: (value: unknown) => typeof value === 'string',
  number: (value: unknown) => typeof value === 'number',
  boolean: (value: unknown) => typeof value === 'boolean',
  object: (value: unknown) => typeof value === 'object',
  array: (value: unknown) => Array.isArray(value),
  instanceOf: (expectedClass: Constructor) => (value: unknown) =>
    value instanceof expectedClass,
  arrayOf: (validator: ValidatorFunction) => (value: unknown) =>
    Array.isArray(value) && value.every(validator),
  recordOf: (validator: ValidatorFunction) => (value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    return Object.values(value).every(validator);
  },
};

function validatePropTypes<T extends InstanceType<Constructor>>(
  instance: T,
  propTypes: Record<string, ValidatorFunction>
) {
  for (const [propName, validator] of Object.entries(propTypes)) {
    const key = propName as keyof T;
    if (instance[key] === undefined) {
      throw new BlockSuiteError(
        ErrorCode.DefaultRuntimeError,
        `Property ${propName} is required to ${instance.constructor.name}.`
      );
    }
    if (validator && !validator(instance[key])) {
      throw new BlockSuiteError(
        ErrorCode.DefaultRuntimeError,
        `Property ${propName} is invalid to ${instance.constructor.name}.`
      );
    }
  }
}

export function requiredProperties(
  propTypes: Record<string, ValidatorFunction>
) {
  return function (constructor: Constructor<LitElement>) {
    const connectedCallback = constructor.prototype.connectedCallback;

    constructor.prototype.connectedCallback = function () {
      if (connectedCallback) {
        connectedCallback.call(this);
      }
      validatePropTypes(this, propTypes);
    };
  };
}
