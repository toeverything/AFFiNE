import type { GfxPrimitiveElementModel } from '../element-model.js';
import { getObjectPropMeta, setObjectPropMeta } from './common.js';

const convertSymbol = Symbol('convert');

/**
 * The convert decorator is used to convert the property value before it's
 * set to the Y map.
 *
 * Note:
 * 1. This decorator function will not execute in model initialization.
 * @param fn
 * @returns
 */
export function convert<V, T extends GfxPrimitiveElementModel>(
  fn: (propValue: V, instance: T) => unknown
) {
  return function convertDecorator(
    _: unknown,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = String(context.name);
    return {
      init(this: T, v: V) {
        const proto = Object.getPrototypeOf(this);
        setObjectPropMeta(convertSymbol, proto, prop, fn);
        return v;
      },
    } as ClassAccessorDecoratorResult<T, V>;
  };
}

function getConvertMeta(
  proto: unknown,
  prop: string | symbol
): null | ((propValue: unknown, instance: unknown) => unknown) {
  return getObjectPropMeta(proto, convertSymbol, prop);
}

export function convertProps(
  propName: string | symbol,
  propValue: unknown,
  receiver: unknown
) {
  const proto = Object.getPrototypeOf(receiver);
  const convertFn = getConvertMeta(proto, propName as string)!;

  return convertFn ? convertFn(propValue, receiver) : propValue;
}
