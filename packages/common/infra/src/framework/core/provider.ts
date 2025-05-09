import type { Component } from './components/component';
import type { Entity } from './components/entity';
import type { Scope } from './components/scope';
import { withContext } from './constructor-context';
import {
  CircularDependencyError,
  ComponentNotFoundError,
  MissingDependencyError,
  RecursionLimitError,
} from './error';
import { EventBus, type FrameworkEvent } from './event';
import type { Framework } from './framework';
import { parseIdentifier } from './identifier';
import type {
  ComponentVariant,
  FrameworkScopeStack,
  GeneralIdentifier,
  IdentifierValue,
} from './types';

export interface ResolveOptions {
  sameScope?: boolean;
  optional?: boolean;
  noCache?: boolean;
  props?: any;
}

export abstract class FrameworkProvider {
  abstract collection: Framework;
  abstract scope: FrameworkScopeStack;
  abstract getRaw(identifier: IdentifierValue, options?: ResolveOptions): any;
  abstract getAllRaw(
    identifier: IdentifierValue,
    options?: ResolveOptions
  ): Map<ComponentVariant, any>;
  abstract dispose(): void;
  abstract eventBus: EventBus;

  get = <T>(identifier: GeneralIdentifier<T>, options?: ResolveOptions): T => {
    return this.getRaw(parseIdentifier(identifier), {
      ...options,
      optional: false,
    });
  };

  getAll = <T>(
    identifier: GeneralIdentifier<T>,
    options?: ResolveOptions
  ): Map<ComponentVariant, T> => {
    return this.getAllRaw(parseIdentifier(identifier), {
      ...options,
    });
  };

  getOptional = <T>(
    identifier: GeneralIdentifier<T>,
    options?: ResolveOptions
  ): T | undefined => {
    return this.getRaw(parseIdentifier(identifier), {
      ...options,
      optional: true,
    });
  };

  createEntity = <
    T extends Entity<any>,
    Props extends T extends Component<infer P> ? P : never,
  >(
    identifier: GeneralIdentifier<T>,
    ...[props]: Props extends Record<string, never> ? [] : [Props]
  ): T => {
    return this.getRaw(parseIdentifier(identifier), {
      noCache: true,
      sameScope: true,
      props,
    });
  };

  createScope = <
    T extends Scope<any>,
    Props extends T extends Component<infer P> ? P : never,
  >(
    root: GeneralIdentifier<T>,
    ...[props]: Props extends Record<string, never> ? [] : [Props]
  ): T => {
    const newProvider = this.collection.provider(
      [...this.scope, parseIdentifier(root).identifierName],
      this
    );
    return newProvider.getRaw(parseIdentifier(root), {
      sameScope: true,
      props,
    });
  };

  emitEvent = <T>(event: FrameworkEvent<T>, payload: T) => {
    this.eventBus.emit(event, payload);
  };

  [Symbol.dispose]() {
    this.dispose();
  }
}

export class ComponentCachePool {
  cache: Map<string, Map<ComponentVariant, any>> = new Map();

  getOrInsert(identifier: IdentifierValue, insert: () => any) {
    const cache = this.cache.get(identifier.identifierName) ?? new Map();
    if (!cache.has(identifier.variant)) {
      cache.set(identifier.variant, insert());
    }
    const cached = cache.get(identifier.variant);
    this.cache.set(identifier.identifierName, cache);
    return cached;
  }

  dispose() {
    for (const t of this.cache.values()) {
      for (const i of t.values()) {
        if (typeof i === 'object' && typeof i[Symbol.dispose] === 'function') {
          try {
            i[Symbol.dispose]();
          } catch (err) {
            // make a uncaught exception
            setTimeout(() => {
              throw err;
            }, 0);
          }
        }
      }
    }
    this.cache.clear();
  }

  [Symbol.dispose]() {
    this.dispose();
  }
}

class Resolver extends FrameworkProvider {
  constructor(
    public readonly provider: BasicFrameworkProvider,
    public readonly depth = 0,
    public readonly stack: IdentifierValue[] = []
  ) {
    super();
  }

  scope = this.provider.scope;
  collection = this.provider.collection;
  eventBus = this.provider.eventBus;

  getRaw(
    identifier: IdentifierValue,
    {
      sameScope = false,
      optional = false,
      noCache = false,
      props,
    }: ResolveOptions = {}
  ) {
    const factory = this.provider.collection.getFactory(
      identifier,
      this.provider.scope
    );
    if (!factory) {
      if (this.provider.parent && !sameScope) {
        return this.provider.parent.getRaw(identifier, {
          sameScope: sameScope,
          optional,
          noCache,
          props,
        });
      }

      if (optional) {
        return undefined;
      }
      throw new ComponentNotFoundError(identifier);
    }

    const runFactory = () => {
      const nextResolver = this.track(identifier);
      try {
        return withContext(() => factory(nextResolver), {
          provider: this.provider,
          props,
        });
      } catch (err) {
        if (err instanceof ComponentNotFoundError) {
          throw new MissingDependencyError(
            identifier,
            err.identifier,
            this.stack
          );
        }
        throw err;
      }
    };

    if (noCache) {
      return runFactory();
    }

    return this.provider.cache.getOrInsert(identifier, runFactory);
  }

  getAllRaw(
    identifier: IdentifierValue,
    { sameScope = false, noCache, props }: ResolveOptions = {}
  ): Map<ComponentVariant, any> {
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

    const result = new Map<ComponentVariant, any>();

    for (const [variant, factory] of vars) {
      // eslint-disable-next-line sonarjs/no-identical-functions
      const runFactory = () => {
        const nextResolver = this.track(identifier);
        try {
          return withContext(() => factory(nextResolver), {
            provider: this.provider,
            props,
          });
        } catch (err) {
          if (err instanceof ComponentNotFoundError) {
            throw new MissingDependencyError(
              identifier,
              err.identifier,
              this.stack
            );
          }
          throw err;
        }
      };
      let service;
      if (noCache) {
        service = runFactory();
      } else {
        service = this.provider.cache.getOrInsert(
          {
            identifierName: identifier.identifierName,
            variant,
          },
          runFactory
        );
      }
      result.set(variant, service);
    }

    return result;
  }

  track(identifier: IdentifierValue): Resolver {
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

    return new Resolver(this.provider, depth, [...this.stack, identifier]);
  }

  override dispose(): void {}
}

export class BasicFrameworkProvider extends FrameworkProvider {
  public readonly cache = new ComponentCachePool();
  public readonly collection: Framework;
  public readonly eventBus: EventBus;

  disposed = false;

  constructor(
    collection: Framework,
    public readonly scope: string[],
    public readonly parent: FrameworkProvider | null
  ) {
    super();
    this.collection = collection;
    this.eventBus = new EventBus(this, this.parent?.eventBus);
  }

  getRaw(identifier: IdentifierValue, options?: ResolveOptions) {
    const resolver = new Resolver(this);
    return resolver.getRaw(identifier, options);
  }

  getAllRaw(
    identifier: IdentifierValue,
    options?: ResolveOptions
  ): Map<ComponentVariant, any> {
    const resolver = new Resolver(this);
    return resolver.getAllRaw(identifier, options);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cache.dispose();
    this.eventBus.dispose();
  }
}

export class FrameworkStackProvider extends FrameworkProvider {
  public readonly stack: FrameworkProvider[];
  public readonly collection: Framework;
  public readonly eventBus: EventBus;

  constructor(providers: FrameworkProvider[]) {
    if (providers.length === 0) {
      throw new Error('FrameworkStackProvider must have at least one provider');
    }
    super();
    this.stack = [...providers];

    // use the collection and eventBus from the first provider
    this.collection = this.stack[0].collection;
    this.eventBus = this.stack[0].eventBus;
  }

  get scope(): FrameworkScopeStack {
    return this.stack[0]?.scope || [];
  }

  getRaw(identifier: IdentifierValue, options?: ResolveOptions): any {
    for (const provider of this.stack) {
      const service = provider.getRaw(identifier, {
        ...options,
        optional: true,
      });
      if (service) {
        return service;
      }
    }

    if (options?.optional) {
      return undefined;
    }

    throw new ComponentNotFoundError(identifier);
  }

  getAllRaw(
    identifier: IdentifierValue,
    options?: ResolveOptions
  ): Map<ComponentVariant, any> {
    for (const provider of this.stack) {
      const components = provider.getAllRaw(identifier, options);
      if (components.size > 0) {
        return components;
      }
    }

    return new Map();
  }

  dispose(): void {
    // No need to handle the disposal of providers in the stack, as they are passed in externally
  }
}
