import type { Component } from './components/component';
import type { Entity } from './components/entity';
import type { Scope } from './components/scope';
import type { Service } from './components/service';
import { DEFAULT_VARIANT, ROOT_SCOPE, SUB_COMPONENTS } from './consts';
import { DuplicateDefinitionError } from './error';
import { parseIdentifier } from './identifier';
import type { FrameworkProvider } from './provider';
import { BasicFrameworkProvider } from './provider';
import { stringifyScope } from './scope';
import type {
  ComponentFactory,
  ComponentVariant,
  FrameworkScopeStack,
  GeneralIdentifier,
  Identifier,
  IdentifierType,
  IdentifierValue,
  SubComponent,
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
export class Framework {
  private readonly components: Map<
    string,
    Map<string, Map<ComponentVariant, ComponentFactory>>
  > = new Map();

  /**
   * Create an empty service collection.
   *
   * same as `new ServiceCollection()`
   */
  static get EMPTY() {
    return new Framework();
  }

  /**
   * The number of services in the collection.
   */
  get componentCount() {
    let count = 0;
    for (const [, identifiers] of this.components) {
      for (const [, variants] of identifiers) {
        count += variants.size;
      }
    }
    return count;
  }

  /**
   * @see {@link FrameworkEditor.service}
   */
  get service() {
    return new FrameworkEditor(this).service;
  }

  /**
   * @see {@link FrameworkEditor.impl}
   */
  get impl() {
    return new FrameworkEditor(this).impl;
  }

  /**
   * @see {@link FrameworkEditor.entity}
   */
  get entity() {
    return new FrameworkEditor(this).entity;
  }

  /**
   * @see {@link FrameworkEditor.scope}
   */
  get scope() {
    return new FrameworkEditor(this).scope;
  }

  /**
   * @see {@link FrameworkEditor.override}
   */
  get override() {
    return new FrameworkEditor(this).override;
  }

  /**
   * @internal Use {@link impl} instead.
   */
  addValue<T>(
    identifier: GeneralIdentifier<T>,
    value: T,
    {
      scope,
      override,
    }: { scope?: FrameworkScopeStack; override?: boolean } = {}
  ) {
    this.addFactory(parseIdentifier(identifier) as Identifier<T>, () => value, {
      scope,
      override,
    });
  }

  /**
   * @internal Use {@link impl} instead.
   */
  addFactory<T>(
    identifier: GeneralIdentifier<T>,
    factory: ComponentFactory<T>,
    {
      scope,
      override,
    }: { scope?: FrameworkScopeStack; override?: boolean } = {}
  ) {
    // convert scope to string
    const normalizedScope = stringifyScope(scope ?? ROOT_SCOPE);
    const normalizedIdentifier = parseIdentifier(identifier);
    const normalizedVariant = normalizedIdentifier.variant ?? DEFAULT_VARIANT;

    const services =
      this.components.get(normalizedScope) ??
      new Map<string, Map<ComponentVariant, ComponentFactory>>();

    const variants =
      services.get(normalizedIdentifier.identifierName) ??
      new Map<ComponentVariant, ComponentFactory>();

    // throw if service already exists, unless it is an override
    if (variants.has(normalizedVariant) && !override) {
      throw new DuplicateDefinitionError(normalizedIdentifier);
    }
    variants.set(normalizedVariant, factory);
    services.set(normalizedIdentifier.identifierName, variants);
    this.components.set(normalizedScope, services);
  }

  remove(identifier: IdentifierValue, scope: FrameworkScopeStack = ROOT_SCOPE) {
    const normalizedScope = stringifyScope(scope);
    const normalizedIdentifier = parseIdentifier(identifier);
    const normalizedVariant = normalizedIdentifier.variant ?? DEFAULT_VARIANT;

    const services = this.components.get(normalizedScope);
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
    scope: FrameworkScopeStack = ROOT_SCOPE,
    parent: FrameworkProvider | null = null
  ): FrameworkProvider {
    return new BasicFrameworkProvider(this, scope, parent);
  }

  /**
   * @internal
   */
  getFactory(
    identifier: IdentifierValue,
    scope: FrameworkScopeStack = ROOT_SCOPE
  ): ComponentFactory | undefined {
    return this.components
      .get(stringifyScope(scope))
      ?.get(identifier.identifierName)
      ?.get(identifier.variant ?? DEFAULT_VARIANT);
  }

  /**
   * @internal
   */
  getFactoryAll(
    identifier: IdentifierValue,
    scope: FrameworkScopeStack = ROOT_SCOPE
  ): Map<ComponentVariant, ComponentFactory> {
    return new Map(
      this.components.get(stringifyScope(scope))?.get(identifier.identifierName)
    );
  }

  /**
   * Clone the entire service collection.
   *
   * This method is quite cheap as it only clones the references.
   *
   * @returns A new service collection with the same services.
   */
  clone(): Framework {
    const di = new Framework();
    for (const [scope, identifiers] of this.components) {
      const s = new Map();
      for (const [identifier, variants] of identifiers) {
        s.set(identifier, new Map(variants));
      }
      di.components.set(scope, s);
    }
    return di;
  }
}

/**
 * A helper class to edit a framework.
 */
class FrameworkEditor {
  private currentScopeStack: FrameworkScopeStack = ROOT_SCOPE;

  constructor(private readonly collection: Framework) {}

  /**
   * Add a service to the collection.
   *
   * @see {@link Framework}
   *
   * @example
   * ```ts
   * add(ServiceClass, [dependencies, ...])
   * ```
   */
  service = <
    Arg1 extends Type<Service>,
    Arg2 extends Deps | ComponentFactory<ServiceType> | ServiceType,
    ServiceType = IdentifierType<Arg1>,
    Deps = Arg1 extends Type<ServiceType>
      ? TypesToDeps<ConstructorParameters<Arg1>>
      : [],
  >(
    service: Arg1,
    ...[arg2]: Arg2 extends [] ? [] : [Arg2]
  ): this => {
    if (arg2 instanceof Function) {
      this.collection.addFactory<any>(service as any, arg2 as any, {
        scope: this.currentScopeStack,
      });
    } else if (arg2 instanceof Array || arg2 === undefined) {
      this.collection.addFactory<any>(
        service as any,
        dependenciesToFactory(service, arg2 as any),
        { scope: this.currentScopeStack }
      );
    } else {
      this.collection.addValue<any>(service as any, arg2, {
        scope: this.currentScopeStack,
      });
    }

    if (SUB_COMPONENTS in service) {
      const subComponents = (service as any)[SUB_COMPONENTS] as SubComponent[];
      for (const { identifier, factory } of subComponents) {
        this.collection.addFactory(identifier, factory, {
          scope: this.currentScopeStack,
        });
      }
    }

    return this;
  };

  store = this.service;

  entity = <
    Arg1 extends Type<Entity<any>>,
    Arg2 extends Deps | ComponentFactory<EntityType>,
    EntityType = IdentifierType<Arg1>,
    Deps = Arg1 extends Type<EntityType>
      ? TypesToDeps<ConstructorParameters<Arg1>>
      : [],
  >(
    entity: Arg1,
    ...[arg2]: Arg2 extends [] ? [] : [Arg2]
  ): this => {
    if (arg2 instanceof Function) {
      this.collection.addFactory<any>(entity as any, arg2 as any, {
        scope: this.currentScopeStack,
      });
    } else {
      this.collection.addFactory<any>(
        entity as any,
        dependenciesToFactory(entity, arg2 as any),
        { scope: this.currentScopeStack }
      );
    }

    return this;
  };

  /**
   * Add an implementation for identifier to the collection.
   *
   * @see {@link Framework}
   *
   * @example
   * ```ts
   * addImpl(Identifier, Class, [dependencies, ...])
   * or
   * addImpl(Identifier, Instance)
   * or
   * addImpl(Identifier, Factory)
   * ```
   */
  impl = <
    Arg1 extends Identifier<any>,
    Arg2 extends Type<Trait> | ComponentFactory<Trait> | Trait,
    Arg3 extends Deps,
    Trait = IdentifierType<Arg1>,
    Deps = Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [],
  >(
    identifier: Arg1,
    arg2: Arg2,
    ...[arg3]: Arg3 extends [] ? [] : [Arg3]
  ): this => {
    if (arg2 instanceof Function) {
      this.collection.addFactory<any>(
        identifier,
        dependenciesToFactory(arg2, arg3 as any[]),
        { scope: this.currentScopeStack }
      );
    } else {
      this.collection.addValue(identifier, arg2 as any, {
        scope: this.currentScopeStack,
      });
    }

    return this;
  };

  /**
   * same as {@link impl} but this method will override the component if it exists.
   *
   * @see {@link Framework}
   *
   * @example
   * ```ts
   * override(OriginClass, NewClass, [dependencies, ...])
   * or
   * override(Identifier, Class, [dependencies, ...])
   * or
   * override(Identifier, Instance)
   * or
   * override(Identifier, Factory)
   * ```
   */
  override = <
    Arg1 extends GeneralIdentifier<any>,
    Arg2 extends Type<Trait> | ComponentFactory<Trait> | Trait | null,
    Arg3 extends Deps,
    Trait extends Component = IdentifierType<Arg1>,
    Deps = Arg2 extends Type<Trait>
      ? TypesToDeps<ConstructorParameters<Arg2>>
      : [],
  >(
    identifier: Arg1,
    arg2: Arg2,
    ...[arg3]: Arg3 extends [] ? [] : [Arg3]
  ): this => {
    if (arg2 === null) {
      this.collection.remove(
        parseIdentifier(identifier),
        this.currentScopeStack
      );
      return this;
    } else if (arg2 instanceof Function) {
      this.collection.addFactory<any>(
        identifier,
        dependenciesToFactory(arg2, arg3 as any[]),
        { scope: this.currentScopeStack, override: true }
      );
    } else {
      this.collection.addValue(identifier, arg2 as any, {
        scope: this.currentScopeStack,
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
  scope = (scope: Type<Scope<any>>): this => {
    this.currentScopeStack = [
      ...this.currentScopeStack,
      parseIdentifier(scope).identifierName,
    ];

    this.collection.addFactory<any>(
      scope as any,
      dependenciesToFactory(scope, [] as any),
      { scope: this.currentScopeStack, override: true }
    );

    return this;
  };
}

/**
 * Convert dependencies definition to a factory function.
 */
function dependenciesToFactory(
  cls: any,
  deps: any[] = []
): ComponentFactory<any> {
  return (provider: FrameworkProvider) => {
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
