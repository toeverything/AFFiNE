import { stableHash } from '../../utils/stable-hash';
import type { Component } from './components/component';
import { DEFAULT_VARIANT } from './consts';
import type {
  ComponentVariant,
  Identifier,
  IdentifierValue,
  Type,
} from './types';

/**
 * create a Identifier.
 *
 * Identifier is used to identify a certain type of service. With the identifier, you can reference one or more services
 * without knowing the specific implementation, thereby achieving
 * [inversion of control](https://en.wikipedia.org/wiki/Inversion_of_control).
 *
 * @example
 * ```ts
 * // define a interface
 * interface Storage {
 *   get(key: string): string | null;
 *   set(key: string, value: string): void;
 * }
 *
 * // create a identifier
 * // NOTICE: Highly recommend to use the interface name as the identifier name,
 * // so that it is easy to understand. and it is legal to do so in TypeScript.
 * const Storage = createIdentifier<Storage>('Storage');
 *
 * // create a implementation
 * class LocalStorage implements Storage {
 *   get(key: string): string | null {
 *     return localStorage.getItem(key);
 *   }
 *   set(key: string, value: string): void {
 *     localStorage.setItem(key, value);
 *   }
 * }
 *
 * // register the implementation to the identifier
 * framework.impl(Storage, LocalStorage);
 *
 * // get the implementation from the identifier
 * const storage = framework.provider().get(Storage);
 * storage.set('foo', 'bar');
 * ```
 *
 * With identifier:
 *
 * * You can easily replace the implementation of a `Storage` without changing the code that uses it.
 * * You can easily mock a `Storage` for testing.
 *
 * # Variant
 *
 * Sometimes, you may want to register multiple implementations for the same interface.
 * For example, you may want have both `LocalStorage` and `SessionStorage` for `Storage`,
 * and use them in same time.
 *
 * In this case, you can use `variant` to distinguish them.
 *
 * ```ts
 * const Storage = createIdentifier<Storage>('Storage');
 * const LocalStorage = Storage('local');
 * const SessionStorage = Storage('session');
 *
 * framework.impl(LocalStorage, LocalStorageImpl);
 * framework.impl(SessionStorage, SessionStorageImpl);
 *
 * // get the implementation from the identifier
 * const localStorage = framework.provider().get(LocalStorage);
 * const sessionStorage = framework.provider().get(SessionStorage);
 * const storage = framework.provider().getAll(Storage); // { local: LocalStorageImpl, session: SessionStorageImpl }
 * ```
 *
 * @param name unique name of the identifier.
 * @param variant The default variant name of the identifier, can be overridden by `identifier("variant")`.
 */
export function createIdentifier<T>(
  name: string,
  variant: ComponentVariant = DEFAULT_VARIANT
): Identifier<T> & ((variant: ComponentVariant) => Identifier<T>) {
  return Object.assign(
    (variant: ComponentVariant) => {
      return createIdentifier<T>(name, variant);
    },
    {
      identifierName: name,
      variant,
    }
  ) as any;
}

/**
 * Convert the constructor into a ServiceIdentifier.
 * As we always deal with ServiceIdentifier in the DI container.
 *
 * @internal
 */
export function createIdentifierFromConstructor<T extends Component>(
  target: Type<T>
): Identifier<T> {
  return createIdentifier<T>(`${target.name}${stableHash(target)}`);
}

export function parseIdentifier(input: any): IdentifierValue {
  if (input.identifierName) {
    return input as IdentifierValue;
  } else if (typeof input === 'function' && input.name) {
    return createIdentifierFromConstructor(input);
  } else {
    throw new Error('Input is not a service identifier.');
  }
}
