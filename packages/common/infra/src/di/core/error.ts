import type { ServiceType, ServiceVariant } from './types';

export class RecursionLimitError extends Error {
  constructor() {
    super('Dynamic resolve recursion limit reached');
  }
}

export class CircularDependencyError extends Error {
  constructor(
    public readonly dependencyStack: [ServiceType, ServiceVariant][]
  ) {
    super(
      `A circular dependency was detected.\n` +
        dependencyStack
          .map(
            ([type, variant]) => `[${type.toString()}](${variant.toString()})`
          )
          .join(' -> ')
    );
  }
}

export class ServiceNotFoundError extends Error {
  constructor(
    public readonly type: ServiceType,
    public readonly variant: ServiceVariant
  ) {
    super(
      `Service [${type.toString()}](${variant.toString()}) not found in container`
    );
  }
}

export class MissingDependencyError extends Error {
  constructor(
    public readonly from: { type: ServiceType; variant: ServiceVariant },
    public readonly target: { type: ServiceType; variant: ServiceVariant }
  ) {
    super(
      `Missing dependency [${from.type.toString()}](${from.variant.toString()}) in creating service [${target.type.toString()}](${target.variant.toString()}).`
    );
  }
}
