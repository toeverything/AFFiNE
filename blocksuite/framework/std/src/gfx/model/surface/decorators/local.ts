import type { GfxPrimitiveElementModel } from '../element-model.js';
import { getDecoratorState } from './common.js';
import { convertProps } from './convert.js';
import { getDerivedProps, updateDerivedProps } from './derive.js';

/**
 * A decorator to mark the property as a local property.
 *
 * The local property act like it is a field property, but it's not synced to the Y map.
 * Updating local property will also trigger the `elementUpdated` slot of the surface model
 */
export function local<V, T extends GfxPrimitiveElementModel>() {
  return function localDecorator(
    _target: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext
  ) {
    const prop = context.name;

    return {
      init(this: T, v: V) {
        this._local.set(prop, v);

        return v;
      },
      get(this: T) {
        return this._local.get(prop);
      },
      set(this: T, originalValue: unknown) {
        const isCreating = getDecoratorState(this.surface)?.creating;
        const oldValue = this._local.get(prop);
        // When state is creating, the value is considered as default value
        // hence there's no need to convert it
        const newVal = isCreating
          ? originalValue
          : convertProps(prop, originalValue, this);

        const derivedProps = getDerivedProps(prop, originalValue, this);

        this._local.set(prop, newVal);

        // During creating, no need to invoke an update event and derive another update
        if (!isCreating) {
          updateDerivedProps(derivedProps, this);

          this._onChange({
            props: {
              [prop]: newVal,
            },
            oldValues: {
              [prop]: oldValue,
            },
            local: true,
          });
        }
      },
    } as ClassAccessorDecoratorResult<T, V>;
  };
}
