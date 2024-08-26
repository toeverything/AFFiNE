import { z } from 'zod';

const BSEditorSettingSchema = z.object({
  // TODO: import from bs
  connector: z.object({
    stroke: z
      .union([
        z.string(),
        z.object({
          dark: z.string(),
          light: z.string(),
        }),
      ])
      .default('#000000'),
  }),
});

const AffineEditorSettingSchema = z.object({
  fontFamily: z.enum(['Sans', 'Serif', 'Mono', 'Custom']).default('Sans'),
});

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

type FlattenZodObject<O, Prefix extends string = ''> =
  O extends z.ZodObject<infer T>
    ? {
        [A in keyof T]: T[A] extends z.ZodObject<any>
          ? A extends string
            ? FlattenZodObject<T[A], `${Prefix}${A}.`>
            : never
          : A extends string
            ? { [key in `${Prefix}${A}`]: T[A] }
            : never;
      }[keyof T]
    : never;

function flattenZodObject<S extends z.ZodObject<any>>(
  schema: S,
  target: z.ZodObject<any> = z.object({}),
  prefix = ''
) {
  for (const key in schema.shape) {
    const value = schema.shape[key];
    if (value instanceof z.ZodObject) {
      flattenZodObject(value, target, prefix + key + '.');
    } else {
      target.shape[prefix + key] = value;
    }
  }
  type Result = UnionToIntersection<FlattenZodObject<S>>;
  return target as Result extends z.ZodRawShape ? z.ZodObject<Result> : never;
}

export const EditorSettingSchema = flattenZodObject(
  BSEditorSettingSchema.merge(AffineEditorSettingSchema)
);

export type EditorSettingSchema = z.infer<typeof EditorSettingSchema>;
