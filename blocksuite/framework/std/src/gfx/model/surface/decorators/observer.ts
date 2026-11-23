import type * as Y from 'yjs';

import type { GfxPrimitiveElementModel } from '../element-model.js';
import { getObjectPropMeta, setObjectPropMeta } from './common.js';

const observeSymbol = Symbol('observe');
const observerDisposableSymbol = Symbol('observerDisposable');

type ObserveFn<
  E extends Y.YEvent<any> = Y.YEvent<any>,
  T extends GfxPrimitiveElementModel = GfxPrimitiveElementModel,
> = (
  /**
   * The event object of the Y.Map or Y.Array, the `null` value means the observer is initializing.
   */
  event: E | null,
  instance: T,
  /**
   * The transaction object of the Y.Map or Y.Array, the `null` value means the observer is initializing.
   */
  transaction: Y.Transaction | null
) => void;

/**
 * A decorator to observe the y type property.
 * You can think of it is just a decorator version of 'observe' method of Y.Array and Y.Map.
 *
 * The observer function start to observe the property when the model is mounted. And it will
 * re-observe the property automatically when the value is altered.
 * @param fn
 * @returns
 */
export function observe<
  V,
  E extends Y.YEvent<any>,
  T extends GfxPrimitiveElementModel,
>(fn: ObserveFn<E, T>) {
  return function observeDecorator(
    _: unknown,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = context.name;
    return {
      init(this: T, v: V) {
        setObjectPropMeta(observeSymbol, Object.getPrototypeOf(this), prop, fn);
        return v;
      },
    } as ClassAccessorDecoratorResult<GfxPrimitiveElementModel, V>;
  };
}

function getObserveMeta(
  proto: unknown,
  prop: string | symbol
): null | ObserveFn {
  return getObjectPropMeta(proto, observeSymbol, prop);
}

export function startObserve(
  prop: string | symbol,
  receiver: GfxPrimitiveElementModel
) {
  const proto = Object.getPrototypeOf(receiver);
  const observeFn = getObserveMeta(proto, prop as string)!;
  // @ts-expect-error ignore
  const observerDisposable = receiver[observerDisposableSymbol] ?? {};

  // @ts-expect-error ignore
  receiver[observerDisposableSymbol] = observerDisposable;

  if (observerDisposable[prop]) {
    observerDisposable[prop]();
    delete observerDisposable[prop];
  }

  if (!observeFn) {
    return;
  }

  const value = receiver[prop as keyof GfxPrimitiveElementModel] as
    | Y.Map<unknown>
    | Y.Array<unknown>
    | null;

  observeFn(null, receiver, null);

  const fn = (event: Y.YEvent<any>, transaction: Y.Transaction) => {
    observeFn(event, receiver, transaction);
  };

  if (value && 'observe' in value) {
    value.observe(fn);

    observerDisposable[prop] = () => {
      value.unobserve(fn);
    };
  } else {
    console.warn(
      `Failed to observe "${prop.toString()}" of ${
        receiver.type
      } element, make sure it's a Y type.`
    );
  }
}

export function initializeObservers(
  proto: unknown,
  receiver: GfxPrimitiveElementModel
) {
  const observers = getObjectPropMeta(proto, observeSymbol);

  Object.keys(observers).forEach(prop => {
    startObserve(prop, receiver);
  });

  receiver['_disposable'].add(() => {
    // @ts-expect-error ignore
    Object.values(receiver[observerDisposableSymbol] ?? {}).forEach(dispose =>
      (dispose as () => void)()
    );
  });
}
