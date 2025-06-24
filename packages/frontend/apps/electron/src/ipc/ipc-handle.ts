import 'reflect-metadata';

import { IpcScope } from './constant';

export const IPC_HANDLE_META_KEY = Symbol('ipc:handler');

// Define the structure for the options object
interface IpcHandleOptions {
  scope: IpcScope;
  name?: string;
}

// Update decorator signature to accept options object
export function IpcHandle(
  options: IpcHandleOptions
): PropertyDecorator & MethodDecorator {
  // Basic validation
  if (
    !options ||
    typeof options.scope !== 'string' ||
    options.scope.trim() === ''
  ) {
    throw new Error('@IpcHandle requires a non-empty "scope" property.');
  }
  if (
    options.name !== undefined &&
    (typeof options.name !== 'string' || options.name.trim() === '')
  ) {
    throw new Error(
      '@IpcHandle "name" property, if provided, must be a non-empty string.'
    );
  }

  return (
    target: any, // Class prototype for methods / prototype for instance properties
    key: string | symbol, // Method or property name
    descriptor?: PropertyDescriptor // May be undefined for property initializers
  ) => {
    const methodName = String(key);

    // Construct the channel name using scope and optional name or methodName
    const channel = `${options.scope}:${options.name ?? methodName}`;

    if (descriptor && typeof descriptor.value === 'function') {
      // ----- Regular method decorator -----
      const originalFn = descriptor.value;
      Reflect.defineMetadata(IPC_HANDLE_META_KEY, channel, originalFn);
      return descriptor;
    }

    // ----- Class property (arrow function) decorator -----
    // Define metadata on the property once the value is assigned (during construction)
    // We achieve this by creating a property descriptor with a setter that intercepts the
    // first assignment of the arrow function and attaches the metadata to the function value.

    const privateKey = Symbol(`__ipc_handle_${methodName}`);

    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get() {
        return (this as any)[privateKey];
      },
      set(value: any) {
        if (typeof value === 'function') {
          Reflect.defineMetadata(IPC_HANDLE_META_KEY, channel, value);
        }
        // After attaching metadata, replace the property with the concrete value to avoid
        // unnecessary getter/setter overhead for subsequent accesses.
        Object.defineProperty(this, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        (this as any)[privateKey] = value;
      },
    });

    // Explicit return to satisfy noImplicitReturns when other branch returns a descriptor
    return;
  };
}
