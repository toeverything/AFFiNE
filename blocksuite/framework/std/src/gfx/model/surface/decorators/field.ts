import type { GfxPrimitiveElementModel } from '../element-model.js';
import { getDecoratorState } from './common.js';
import { convertProps } from './convert.js';
import { getDerivedProps, updateDerivedProps } from './derive.js';
import { startObserve } from './observer.js';

const yPropsSetSymbol = Symbol('yProps');

export function getFieldPropsSet(target: unknown): Set<string | symbol> {
  const proto = Object.getPrototypeOf(target);
  if (!Object.hasOwn(proto, yPropsSetSymbol)) {
    proto[yPropsSetSymbol] = new Set();
  }

  return proto[yPropsSetSymbol] as Set<string | symbol>;
}

export function field<V, T extends GfxPrimitiveElementModel>(fallback?: V) {
  return function yDecorator(
    _: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = context.name;

    return {
      init(this: GfxPrimitiveElementModel, v: V) {
        const yProps = getFieldPropsSet(this);

        yProps.add(prop);

        if (
          getDecoratorState(
            this.surface ?? Object.getPrototypeOf(this).constructor
          )?.skipField
        ) {
          return;
        }

        if (this.yMap) {
          if (this.yMap.doc) {
            this.surface.store.transact(() => {
              this.yMap.set(prop as string, v);
            });
          } else {
            this.yMap.set(prop as string, v);
            this._preserved.set(prop as string, v);
          }
        }

        return v;
      },
      get(this: GfxPrimitiveElementModel) {
        return (
          (this.yMap.doc ? this.yMap.get(prop as string) : null) ??
          this._preserved.get(prop as string) ??
          fallback
        );
      },
      set(this: T, originalVal: V) {
        const isCreating = getDecoratorState(this.surface)?.creating;

        if (getDecoratorState(this.surface)?.skipField) {
          return;
        }

        const derivedProps = getDerivedProps(prop, originalVal, this);
        const val = isCreating
          ? originalVal
          : convertProps(prop, originalVal, this);

        if (this.yMap.doc) {
          this.surface.store.transact(() => {
            this.yMap.set(prop as string, val);
          });
        } else {
          this.yMap.set(prop as string, val);
          this._preserved.set(prop as string, val);
        }

        startObserve(prop as string, this);

        if (!isCreating) {
          updateDerivedProps(derivedProps, this);
        }
      },
    } as ClassAccessorDecoratorResult<T, V>;
  };
}
