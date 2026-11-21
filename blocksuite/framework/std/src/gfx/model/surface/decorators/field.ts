import { Text } from '@blocksuite/store';

import type { GfxPrimitiveElementModel } from '../element-model.js';
import { getDecoratorState } from './common.js';
import { convertProps } from './convert.js';
import { getDerivedProps, updateDerivedProps } from './derive.js';
import { startObserve } from './observer.js';

function unwrapSurfaceFieldValue(value: unknown): unknown {
  if (value instanceof Text) {
    return value.yText.doc ? value.yText.clone() : value.yText;
  }
  return value;
}

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

        const unwrapped = unwrapSurfaceFieldValue(v);
        if (this.yMap) {
          if (this.yMap.doc) {
            this.surface.store.transact(() => {
              this.yMap.set(prop as string, unwrapped);
            });
          } else {
            this.yMap.set(prop as string, unwrapped);
            this._preserved.set(prop as string, unwrapped);
          }
        }

        return unwrapped;
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
        const val = unwrapSurfaceFieldValue(
          isCreating ? originalVal : convertProps(prop, originalVal, this)
        );

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
