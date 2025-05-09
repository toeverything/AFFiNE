import type { SurfaceBlockModel } from '../surface-model.js';

/**
 * Set metadata for a property
 * @param symbol Unique symbol for the metadata
 * @param target The target object to set metadata on, usually the prototype
 * @param prop The property name
 * @param val The value to set
 */
export function setObjectPropMeta(
  symbol: symbol,
  target: unknown,
  prop: string | symbol,
  val: unknown
) {
  // @ts-expect-error ignore
  target[symbol] = target[symbol] ?? {};
  // @ts-expect-error ignore
  target[symbol][prop] = val;
}

/**
 * Get metadata for a property
 * @param target The target object to retrieve metadata from, usually the prototype
 * @param symbol Unique symbol for the metadata
 * @param prop The property name, if not provided, returns all metadata for that symbol
 * @returns
 */
export function getObjectPropMeta(
  target: unknown,
  symbol: symbol,
  prop?: string | symbol
) {
  if (prop) {
    // @ts-expect-error ignore
    return target[symbol]?.[prop] ?? null;
  }

  // @ts-expect-error ignore
  return target[symbol] ?? {};
}

export function getDecoratorState(surface: SurfaceBlockModel) {
  return surface['_decoratorState'];
}

export function createDecoratorState() {
  return {
    creating: false,
    deriving: false,
    skipField: false,
  };
}
