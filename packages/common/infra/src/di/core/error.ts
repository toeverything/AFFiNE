import { DEFAULT_SERVICE_VARIANT } from './consts';
import type { ServiceIdentifierValue } from './types';

export class RecursionLimitError extends Error {
  constructor() {
    super('Dynamic resolve recursion limit reached');
  }
}

export class CircularDependencyError extends Error {
  constructor(public readonly dependencyStack: ServiceIdentifierValue[]) {
    super(
      `A circular dependency was detected.\n` +
        stringifyDependencyStack(dependencyStack)
    );
  }
}

export class ServiceNotFoundError extends Error {
  constructor(public readonly identifier: ServiceIdentifierValue) {
    super(`Service ${stringifyIdentifier(identifier)} not found in container`);
  }
}

export class MissingDependencyError extends Error {
  constructor(
    public readonly from: ServiceIdentifierValue,
    public readonly target: ServiceIdentifierValue,
    public readonly dependencyStack: ServiceIdentifierValue[]
  ) {
    super(
      `Missing dependency ${stringifyIdentifier(
        target
      )} in creating service ${stringifyIdentifier(
        from
      )}.\n${stringifyDependencyStack(dependencyStack)}`
    );
  }
}

export class DuplicateServiceDefinitionError extends Error {
  constructor(public readonly identifier: ServiceIdentifierValue) {
    super(`Service ${stringifyIdentifier(identifier)} already exists`);
  }
}

function stringifyIdentifier(identifier: ServiceIdentifierValue) {
  return `[${identifier.identifierName}]${
    identifier.variant !== DEFAULT_SERVICE_VARIANT
      ? `(${identifier.variant})`
      : ''
  }`;
}

function stringifyDependencyStack(dependencyStack: ServiceIdentifierValue[]) {
  return dependencyStack
    .map(identifier => `${stringifyIdentifier(identifier)}`)
    .join(' -> ');
}
