import type { Renderer } from './renderer.js';
import type { PropertyConfig } from './types.js';

export type PropertyMetaConfig<
  Type extends string = string,
  PropertyData extends NonNullable<unknown> = NonNullable<unknown>,
  RawValue = unknown,
  JsonValue = unknown,
> = {
  type: Type;
  config: PropertyConfig<PropertyData, RawValue, JsonValue>;
  create: Create<PropertyData>;
  renderer: Renderer<PropertyData, RawValue, JsonValue>;
};
type CreatePropertyMeta<
  Type extends string = string,
  PropertyData extends Record<string, unknown> = Record<string, never>,
  RawValue = unknown,
  JsonValue = unknown,
> = (
  renderer: Omit<Renderer<PropertyData, RawValue, JsonValue>, 'type'>
) => PropertyMetaConfig<Type, PropertyData, RawValue, JsonValue>;
type Create<
  PropertyData extends Record<string, unknown> = Record<string, never>,
> = (
  name: string,
  data?: PropertyData
) => {
  type: string;
  name: string;
  statCalcOp?: string;
  data: PropertyData;
};
export type PropertyModel<
  Type extends string = string,
  PropertyData extends Record<string, unknown> = Record<string, unknown>,
  RawValue = unknown,
  JsonValue = unknown,
> = {
  type: Type;
  config: PropertyConfig<PropertyData, RawValue, JsonValue>;
  create: Create<PropertyData>;
  createPropertyMeta: CreatePropertyMeta<
    Type,
    PropertyData,
    RawValue,
    JsonValue
  >;
};
export const propertyType = <Type extends string>(type: Type) => ({
  type: type,
  modelConfig: <
    PropertyData extends Record<string, unknown> = Record<string, never>,
    RawValue = unknown,
    JsonValue = unknown,
  >(
    ops: PropertyConfig<PropertyData, RawValue, JsonValue>
  ): PropertyModel<Type, PropertyData, RawValue, JsonValue> => {
    const create: Create<PropertyData> = (name, data) => {
      return {
        type,
        name,
        data: data ?? ops.propertyData.default(),
      };
    };
    return {
      type,
      config: ops,
      create,
      createPropertyMeta: renderer => ({
        type,
        config: ops,
        create,
        renderer: {
          type,
          ...renderer,
        },
      }),
    };
  },
});
