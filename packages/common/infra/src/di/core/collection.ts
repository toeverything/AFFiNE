import { DEFAULT_SERVICE_VARIANT, ROOT_SCOPE } from './consts';
import { DuplicateServiceDefinitionError } from './error';
import { parseIdentifier } from './identifier';
import type { ServiceProvider } from './provider';
import { BasicServiceProvider } from './provider';
import { stringifyScope } from './scope';
import type {
  GeneralServiceIdentifier,
  ServiceFactory,
  ServiceIdentifier,
  ServiceIdentifierType,
  ServiceIdentifierValue,
  ServiceScope,
  ServiceVariant,
  Type,
  TypesToDeps,
} from './types';

/**
 * A collection of services.
 *
 * ServiceCollection basically is a tuple of `[scope, identifier, variant, factory]` with some helper methods.
 * It just stores the definitions of services. It never holds any instances of services.
 *
 * # Usage
 *
 * ```ts
 * const services = new ServiceCollection();
 * class ServiceA {
 *   // ...
 * }
 * // add a service
 * services.add(ServiceA);
 *
 * class ServiceB {
 *   constructor(serviceA: ServiceA) {}
 * }
 * // add a service with dependency
 * services.add(ServiceB, [ServiceA]);
 *                         ^ dependency class/identifier, match ServiceB's constructor
 *
 * const FeatureA = createIdentifier<FeatureA>('Config');
 *
 * // add a implementation for a service identifier
 * services.addImpl(FeatureA, ServiceA);
 *
 * // override a service
 * services.override(ServiceA, NewServiceA);
 *
 * // create a service provider
 * const provider = services.provider();
 * ```
 *
 * # The data structure
 *
 * The data structure of ServiceCollection is a three-layer nested Map, used to represent the tuple of
 * `[scope, identifier, variant, factory]`.
 * Such a data structure ensures that a service factory can be uniquely determined by `[scope, identifier, variant]`.
 *
 * When a service added:
 *
 * ```ts
 * services.add(ServiceClass)
 * ```
 *
 * The data structure will be:
 *
 * ```ts
 * Map {
 *  '': Map {                      // scope
 *   'ServiceClass': Map {         // identifier
 *     'default':                  // variant
 *        () => new ServiceClass() // factory
 *  }
 * }
 * ```
 *
 * # Dependency relationship
 *
 * The dependency relationships of services are not actually stored in the ServiceCollection,
 * but are transformed into a factory function when the service is added.
 *
 * For example:
 *
 * ```ts
 * services.add(ServiceB, [ServiceA]);
 *
 * // is equivalent to
 * services.addFactory(ServiceB, (provider) => new ServiceB(provider.get(ServiceA)));
 * ```
 *
 * For multiple implementations of the same service identifier, can be defined as:
 *
 * ```ts
 * services.add(ServiceB, [[FeatureA]]);
 *
 * // is equivalent to
 * services.addFactory(ServiceB, (provider) => new ServiceB(provider.getAll(FeatureA)));
 * ```
 */
export class ServiceCollection {
  private readonly services: Map<
    string,
    Map<string, Map<ServiceVariant, ServiceFactory>>
  > = new Map();

  /**
   * Create an empty service collection.
   *
   * same as `new ServiceCollection()`
   */
  static get EMPTY() {
    return new ServiceCollection();
  }

  /**
   * The number of services in the collection.
   */
  get size() {
    let size = 0;
    for (const [, identifiers] of this.services) {
      for (const [, variants] of identifiers) {
        size += variants.size;
      }
    }
    return size;
  }

  /**
   * @see {@link ServiceCollectionEditor.add}
   */
  get add() {
    return new ServiceCollectionEditor(this).add;
  }

  /**
   * @see {@link ServiceCollectionEditor.addImpl}
   */
  get addImpl() {
    return new ServiceCollectionEditor(this).addImpl;
  }

  /**
   * @see {@link ServiceCollectionEditor.scope}
   */
  get scope() {
    return new ServiceCollectionEditor(this).scope;
  }

  /**
   * @see {@link ServiceCollectionEditor.scope}
   */
  get override() {
    return new ServiceCollectionEditor(this).override;
  }

  /**
   * @internal Use {@link addImpl} instead.
   */
  addValue<T>(
    identifier: GeneralServiceIdentifier<T>,
    value: T,
    { scope, override }: { scope?: ServiceScope; override?: boolean } = {}
  ) {
    this.addFactory(
      parseIdentifier(identifier) as ServiceIdentifier<T>,
      () => value,
      {
        scope,
        override,
      }
    );
  }

  /**
   * @internal Use {@link addImpl} instead.
   */
  addFactory<T>(
    identifier: GeneralServiceIdentifier<T>,
    factory: ServiceFactory<T>,
    { scope, override }: { scope?: ServiceScope; override?: boolean } = {}
  ) {
    // convert scope to string
    const normalizedScope = stringifyScope(scope ?? ROOT_SCOPE);
    const normalizedIdentifier = parseIdentifier(identifier);
    const normalizedVariant =
      normalizedIdentifier.variant ?? DEFAULT_SERVICE_VARIANT;

    const services =
      this.services.get(normalizedScope) ??
      new Map<string, Map<ServiceVariant, ServiceFactory>>();

    const variants =
      services.get(normalizedIdentifier.identifierName) ??
      new Map<ServiceVariant, ServiceFactory>();

    // throw if service already exists, unless it is an override
    if (variants.has(normalizedVariant) && !override) {
      throw new DuplicateServiceDefinitionError(normalizedIdentifier);
    }
    variants.set(normalizedVariant, factory);
    services.set(normalizedIdentifier.identifierName, variants);
    this.services.set(normalizedScope, services);
  }

  remove(identifier: ServiceIdentifierValue, scope: ServiceScope = ROOT_SCOPE) {
    const normalizedScope = stringifyScope(scope);
    const normalizedIdentifier = parseIdentifier(identifier);
    const normalizedVariant =
      normalizedIdentifier.variant ?? DEFAULT_SERVICE_VARIANT;

    const services = this.services.get(normalizedScope);
    if (!services) {
      return;
    }

    const variants = services.get(normalizedIdentifier.identifierName);
    if (!variants) {
      return;
    }

    variants.delete(normalizedVariant);
  }

  /**
   * Create a service provider from the collection.
   *
   * @example
   * ```ts
   * provider() // create a service provider for root scope
   * provider(ScopeA, parentProvider) // create a service provider for scope A
   * ```
   *
   * @param scope The scope of the service provider, default to the root scope.
   * @param parent The parent service provider, it is required if the scope is not the root scope.
   */
  provider(
    scope: ServiceScope = ROOT_SCOPE,
    parent: ServiceProvider | null = null
  ): ServiceProvider {
    return new BasicServiceProvider(this, scope, parent);
  }

  /**
   * @internal
   */
  getFactory(
    identifier: ServiceIdentifierValue,
    scope: ServiceScope = ROOT_SCOPE
  ): ServiceFactory | undefined {
    return this.services
      .get(stringifyScope(scope))
      ?.get(identifier.identifierName)
      ?.get(identifier.variant ?? DEFAULT_SERVICE_VARIANT);
  }

  /**
   * @internal
   */
  getFactoryAll(
    identifier: ServiceIdentifierValue,
    scope: ServiceScope = ROOT_SCOPE
  ): Map<ServiceVariant, ServiceFactory> {
    return new Map(
      this.services.get(stringifyScope(scope))?.get(identifier.identifierName)
    );
  }

  /**
   * Clone the entire service collection.
   *
   * This method is quite cheap as it only clones the references.
   *
   * @returns A new service collection with the same services.
   */
  clone(): ServiceCollection {
    const di = new ServiceCollection();
    for (const [scope, identifiers] of this.services) {
      const s = new Map();
      for (const [identifier, variants] of identifiers) {
        s.set(identifier, new Map(variants));
      }
      di.services.set(scope, s);
    }
    return di;
  }
}

/**
 * A helper class to edit a service collection.
 */
class ServiceCollectionEditor {
  private currentScope: ServiceScope = ROOT_SCOPE;

  constructor(private readonly collection: ServiceCollection) {}

  /**
   * Add a service to the collection.
   *
   * @see {@link ServiceCollection}
   *
   * @example
   * ```ts
   * add(ServiceClass, [dependencies, ...])
   * ```
   */
  add = <
    T extends new (...args: any) => any,
    const Deps extends TypesToDeps<ConstructorParameters<T>> = TypesToDeps<
      ConstructorParameters<T>
    >,
  >(
    cls: T,
    ...[deps]: Deps extends [] ? [] : [Deps]
  ): this => {
    this.collection.addFactory<any>(
      cls as any,
      dependenciesToFactory(cls, deps as any),
      { scope: this.currentScope }
    );

    return this;
  };

  /**
   * Add an implementation for identifier to the collection.
   *
   * @see {@link ServiceCollection}
   *
   * @example
   * ```ts
   * addImpl(ServiceIdentifier, ServiceClass, [dependencies, ...])
   * or
   * addImpl(ServiceIdentifier, Instance)
   * or
   * addImpl(ServiceIdentifier, Factory)
   * ```
   */
  addImpl = <
    Arg1 extends ServiceIdentifier<any>,
    Arg2 extends Type<Trait> | ServiceFactory<Trait> | Trait,
    Trait = ServiceIdentifierType<Arg1>,
    Deps extends Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [] = Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [],
    Arg3 extends Deps = Deps,
  >(
    identifier: Arg1,
    arg2: Arg2,
    ...[arg3]: Arg3 extends [] ? [] : [Arg3]
  ): this => {
    if (arg2 instanceof Function) {
      this.collection.addFactory<any>(
        identifier,
        dependenciesToFactory(arg2, arg3 as any[]),
        { scope: this.currentScope }
      );
    } else {
      this.collection.addValue(identifier, arg2 as any, {
        scope: this.currentScope,
      });
    }

    return this;
  };

  /**
   * same as {@link addImpl} but this method will override the service if it exists.
   *
   * @see {@link ServiceCollection}
   *
   * @example
   * ```ts
   * override(OriginServiceClass, NewServiceClass, [dependencies, ...])
   * or
   * override(ServiceIdentifier, ServiceClass, [dependencies, ...])
   * or
   * override(ServiceIdentifier, Instance)
   * or
   * override(ServiceIdentifier, Factory)
   * ```
   */
  override = <
    Arg1 extends ServiceIdentifier<any>,
    Arg2 extends Type<Trait> | ServiceFactory<Trait> | Trait | null,
    Trait = ServiceIdentifierType<Arg1>,
    Deps extends Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [] = Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [],
    Arg3 extends Deps = Deps,
  >(
    identifier: Arg1,
    arg2: Arg2,
    ...[arg3]: Arg3 extends [] ? [] : [Arg3]
  ): this => {
    if (arg2 === null) {
      this.collection.remove(identifier, this.currentScope);
      return this;
    } else if (arg2 instanceof Function) {
      this.collection.addFactory<any>(
        identifier,
        dependenciesToFactory(arg2, arg3 as any[]),
        { scope: this.currentScope, override: true }
      );
    } else {
      this.collection.addValue(identifier, arg2 as any, {
        scope: this.currentScope,
        override: true,
      });
    }

    return this;
  };

  /**
   * Set the scope for the service registered subsequently
   *
   * @example
   *
   * ```ts
   * const ScopeA = createScope('a');
   *
   * services.scope(ScopeA).add(XXXService, ...);
   * ```
   */
  scope = (scope: ServiceScope): ServiceCollectionEditor => {
    this.currentScope = scope;
    return this;
  };
}

/**
 * Convert dependencies definition to a factory function.
 */
function dependenciesToFactory(
  cls: any,
  deps: any[] = []
): ServiceFactory<any> {
  return (provider: ServiceProvider) => {
    const args = [];
    for (const dep of deps) {
      let isAll;
      let identifier;
      if (Array.isArray(dep)) {
        if (dep.length !== 1) {
          throw new Error('Invalid dependency');
        }
        isAll = true;
        identifier = dep[0];
      } else {
        isAll = false;
        identifier = dep;
      }
      if (isAll) {
        args.push(Array.from(provider.getAll(identifier).values()));
      } else {
        args.push(provider.get(identifier));
      }
    }
    if (isConstructor(cls)) {
      return new cls(...args, provider);
    } else {
      return cls(...args, provider);
    }
  };
}

// a hack to check if a function is a constructor
// https://github.com/zloirock/core-js/blob/232c8462c26c75864b4397b7f643a4f57c6981d5/packages/core-js/internals/is-constructor.js#L15
function isConstructor(cls: any) {
  try {
    Reflect.construct(function () {}, [], cls);
    return true;
  } catch (error) {
    return false;
  }
}
