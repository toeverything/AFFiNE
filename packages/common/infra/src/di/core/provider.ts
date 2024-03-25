import type { ServiceCollection } from './collection';
import {
  CircularDependencyError,
  MissingDependencyError,
  RecursionLimitError,
  ServiceNotFoundError,
} from './error';
import { parseIdentifier } from './identifier';
import type {
  GeneralServiceIdentifier,
  ServiceIdentifierValue,
  ServiceVariant,
} from './types';

export interface ResolveOptions {
  sameScope?: boolean;
  optional?: boolean;
}

export abstract class ServiceProvider {
  abstract collection: ServiceCollection;
  abstract getRaw(
    identifier: ServiceIdentifierValue,
    options?: ResolveOptions
  ): any;
  abstract getAllRaw(
    identifier: ServiceIdentifierValue,
    options?: ResolveOptions
  ): Map<ServiceVariant, any>;

  get<T>(identifier: GeneralServiceIdentifier<T>, options?: ResolveOptions): T {
    return this.getRaw(parseIdentifier(identifier), {
      ...options,
      optional: false,
    });
  }

  getAll<T>(
    identifier: GeneralServiceIdentifier<T>,
    options?: ResolveOptions
  ): Map<ServiceVariant, T> {
    return this.getAllRaw(parseIdentifier(identifier), {
      ...options,
    });
  }

  getOptional<T>(
    identifier: GeneralServiceIdentifier<T>,
    options?: ResolveOptions
  ): T | null {
    return this.getRaw(parseIdentifier(identifier), {
      ...options,
      optional: true,
    });
  }
}

export class ServiceCachePool {
  cache: Map<string, Map<ServiceVariant, any>> = new Map();

  getOrInsert(identifier: ServiceIdentifierValue, insert: () => any) {
    const cache = this.cache.get(identifier.identifierName) ?? new Map();
    if (!cache.has(identifier.variant)) {
      cache.set(identifier.variant, insert());
    }
    const cached = cache.get(identifier.variant);
    this.cache.set(identifier.identifierName, cache);
    return cached;
  }
}

export class ServiceResolver extends ServiceProvider {
  constructor(
    public readonly provider: BasicServiceProvider,
    public readonly depth = 0,
    public readonly stack: ServiceIdentifierValue[] = []
  ) {
    super();
  }

  collection = this.provider.collection;

  getRaw(
    identifier: ServiceIdentifierValue,
    { sameScope = false, optional = false }: ResolveOptions = {}
  ) {
    const factory = this.provider.collection.getFactory(
      identifier,
      this.provider.scope
    );
    if (!factory) {
      if (this.provider.parent && !sameScope) {
        return this.provider.parent.getRaw(identifier, {
          sameScope,
          optional,
        });
      }

      if (optional) {
        return undefined;
      }
      throw new ServiceNotFoundError(identifier);
    }

    return this.provider.cache.getOrInsert(identifier, () => {
      const nextResolver = this.track(identifier);
      try {
        return factory(nextResolver);
      } catch (err) {
        if (err instanceof ServiceNotFoundError) {
          throw new MissingDependencyError(
            identifier,
            err.identifier,
            this.stack
          );
        }
        throw err;
      }
    });
  }

  getAllRaw(
    identifier: ServiceIdentifierValue,
    { sameScope = false }: ResolveOptions = {}
  ): Map<ServiceVariant, any> {
    const vars = this.provider.collection.getFactoryAll(
      identifier,
      this.provider.scope
    );

    if (vars === undefined) {
      if (this.provider.parent && !sameScope) {
        return this.provider.parent.getAllRaw(identifier);
      }

      return new Map();
    }

    const result = new Map<ServiceVariant, any>();

    for (const [variant, factory] of vars) {
      const service = this.provider.cache.getOrInsert(
        { identifierName: identifier.identifierName, variant },
        () => {
          const nextResolver = this.track(identifier);
          try {
            return factory(nextResolver);
          } catch (err) {
            if (err instanceof ServiceNotFoundError) {
              throw new MissingDependencyError(
                identifier,
                err.identifier,
                this.stack
              );
            }
            throw err;
          }
        }
      );
      result.set(variant, service);
    }

    return result;
  }

  track(identifier: ServiceIdentifierValue): ServiceResolver {
    const depth = this.depth + 1;
    if (depth >= 100) {
      throw new RecursionLimitError();
    }
    const circular = this.stack.find(
      i =>
        i.identifierName === identifier.identifierName &&
        i.variant === identifier.variant
    );
    if (circular) {
      throw new CircularDependencyError([...this.stack, identifier]);
    }

    return new ServiceResolver(this.provider, depth, [
      ...this.stack,
      identifier,
    ]);
  }
}

export class BasicServiceProvider extends ServiceProvider {
  public readonly cache = new ServiceCachePool();
  public readonly collection: ServiceCollection;

  constructor(
    collection: ServiceCollection,
    public readonly scope: string[],
    public readonly parent: ServiceProvider | null
  ) {
    super();
    this.collection = collection.clone();
    this.collection.addValue(ServiceProvider, this, {
      scope: scope,
      override: true,
    });
  }

  getRaw(identifier: ServiceIdentifierValue, options?: ResolveOptions) {
    const resolver = new ServiceResolver(this);
    return resolver.getRaw(identifier, options);
  }

  getAllRaw(
    identifier: ServiceIdentifierValue,
    options?: ResolveOptions
  ): Map<ServiceVariant, any> {
    const resolver = new ServiceResolver(this);
    return resolver.getAllRaw(identifier, options);
  }
}
