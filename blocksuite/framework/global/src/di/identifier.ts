import { DEFAULT_SERVICE_VARIANT } from './consts.js';
import { stableHash } from './stable-hash.js';
import type {
  ServiceIdentifier,
  ServiceIdentifierValue,
  ServiceVariant,
  Type,
} from './types.js';

/**
 * create a ServiceIdentifier.
 *
 * ServiceIdentifier is used to identify a certain type of service. With the identifier, you can reference one or more services
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
 * services.addImpl(Storage, LocalStorage);
 *
 * // get the implementation from the identifier
 * const storage = services.provider().get(Storage);
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
 * services.addImpl(LocalStorage, LocalStorageImpl);
 * services.addImpl(SessionStorage, SessionStorageImpl);
 *
 * // get the implementation from the identifier
 * const localStorage = services.provider().get(LocalStorage);
 * const sessionStorage = services.provider().get(SessionStorage);
 * const storage = services.provider().getAll(Storage); // { local: LocalStorageImpl, session: SessionStorageImpl }
 * ```
 *
 * @param name unique name of the identifier.
 * @param variant The default variant name of the identifier, can be overridden by `identifier("variant")`.
 */
export function createIdentifier<T>(
  name: string,
  variant: ServiceVariant = DEFAULT_SERVICE_VARIANT
): ServiceIdentifier<T> &
  (<U extends T = T>(variant: ServiceVariant) => ServiceIdentifier<U>) {
  return Object.assign(
    <U extends T = T>(variant: ServiceVariant) => {
      return createIdentifier<U>(name, variant);
    },
    {
      identifierName: name,
      variant,
    }
  ) as never;
}

/**
 * Convert the constructor into a ServiceIdentifier.
 * As we always deal with ServiceIdentifier in the DI container.
 *
 * @internal
 */
export function createIdentifierFromConstructor<T>(
  target: Type<T>
): ServiceIdentifier<T> {
  return createIdentifier<T>(`${target.name}${stableHash(target)}`);
}

export function parseIdentifier(input: any): ServiceIdentifierValue {
  if (input.identifierName) {
    return input as ServiceIdentifierValue;
  } else if (typeof input === 'function' && input.name) {
    return createIdentifierFromConstructor(input);
  } else {
    throw new Error('Input is not a service identifier.');
  }
}
