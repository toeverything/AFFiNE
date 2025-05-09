import type { GfxPrimitiveElementModel } from '../element-model.js';
import {
  getDecoratorState,
  getObjectPropMeta,
  setObjectPropMeta,
} from './common.js';

const deriveSymbol = Symbol('derive');

const keys = Object.keys;

function getDerivedMeta(
  proto: unknown,
  prop: string | symbol
):
  | null
  | ((propValue: unknown, instance: unknown) => Record<string, unknown>)[] {
  return getObjectPropMeta(proto, deriveSymbol, prop);
}

export function getDerivedProps(
  prop: string | symbol,
  propValue: unknown,
  receiver: GfxPrimitiveElementModel
) {
  const prototype = Object.getPrototypeOf(receiver);
  const decoratorState = getDecoratorState(receiver.surface);

  if (decoratorState.deriving || decoratorState.creating) {
    return null;
  }

  const deriveFns = getDerivedMeta(prototype, prop as string)!;

  return deriveFns
    ? deriveFns.reduce(
        (derivedProps, fn) => {
          const props = fn(propValue, receiver);

          Object.entries(props).forEach(([key, value]) => {
            derivedProps[key] = value;
          });

          return derivedProps;
        },
        {} as Record<string, unknown>
      )
    : null;
}

export function updateDerivedProps(
  derivedProps: Record<string, unknown> | null,
  receiver: GfxPrimitiveElementModel
) {
  if (derivedProps) {
    const decoratorState = getDecoratorState(receiver.surface);
    decoratorState.deriving = true;
    keys(derivedProps).forEach(key => {
      // @ts-expect-error ignore
      receiver[key] = derivedProps[key];
    });
    decoratorState.deriving = false;
  }
}

/**
 * The derive decorator is used to derive other properties' update when the
 * decorated property is updated through assignment in the local.
 *
 * Note:
 * 1. The first argument of the function is the new value of the decorated property
 *    before the `convert` decorator is called.
 * 2. The decorator function will execute after the decorated property has been updated.
 * 3. The decorator function will not execute during model creation.
 * 4. The decorator function will not execute if the decorated property is updated through
 *    the Y map. That is to say, if other peers update the property will not trigger this decorator
 * @param fn
 * @returns
 */
export function derive<V, T extends GfxPrimitiveElementModel>(
  fn: (propValue: any, instance: T) => Record<string, unknown>
) {
  return function deriveDecorator(
    _: unknown,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = String(context.name);
    return {
      init(this: GfxPrimitiveElementModel, v: V) {
        const proto = Object.getPrototypeOf(this);
        const derived = getDerivedMeta(proto, prop);

        if (Array.isArray(derived)) {
          derived.push(fn as (typeof derived)[0]);
        } else {
          setObjectPropMeta(deriveSymbol, proto, prop as string, [fn]);
        }

        return v;
      },
    } as ClassAccessorDecoratorResult<GfxPrimitiveElementModel, V>;
  };
}
