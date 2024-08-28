import { z } from 'zod';

export type FontFamily = 'Sans' | 'Serif' | 'Mono' | 'Custom';

export const fontStyleOptions = [
  { key: 'Sans', value: 'var(--affine-font-sans-family)' },
  { key: 'Serif', value: 'var(--affine-font-serif-family)' },
  { key: 'Mono', value: 'var(--affine-font-mono-family)' },
  { key: 'Custom', value: 'var(--affine-font-sans-family)' },
] satisfies {
  key: FontFamily;
  value: string;
}[];

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
  customFontFamily: z.string().default(''),
  newDocDefaultMode: z.enum(['edgeless', 'page']).default('page'),
  spellCheck: z.boolean().default(false),
  fullWidthLayout: z.boolean().default(false),
  displayDocInfo: z.boolean().default(true),
  displayBiDirectionalLink: z.boolean().default(true),
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
