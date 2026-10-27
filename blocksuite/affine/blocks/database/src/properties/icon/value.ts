import zod from 'zod';

/**
 * Mirrors `IconData` from the shared icon-picker service, kept loose so a
 * value written by a newer picker still round-trips instead of being dropped
 * by the schema. `passthrough` matters for the same reason: zod strips keys it
 * does not declare, and the next `toJson` would then delete them for good.
 *
 * Lives apart from `define.ts` so the row-icon reader can decode a value
 * without pulling in the property definition.
 */
export const IconValueSchema = zod
  .object({
    type: zod.string(),
    unicode: zod.string().optional(),
    name: zod.string().optional(),
    color: zod.string().optional(),
  })
  .passthrough()
  .nullable();

export type IconValue = zod.infer<typeof IconValueSchema>;

/**
 * The stored form is a string, so an icon that is not a plain emoji -- an
 * AFFiNE glyph carries `name` and `color` and no `unicode` at all -- has to be
 * encoded rather than flattened to its unicode, or every export, copy and
 * JSON round trip silently deletes it.
 *
 * A plain emoji is still written as itself, so values already in a document
 * keep working and anything typed by hand is still accepted.
 */
export const encodeIconValue = (value: IconValue | undefined): string => {
  if (!value) return '';
  if (value.type === 'emoji' && value.unicode) return value.unicode;
  return JSON.stringify(value);
};

export const decodeIconValue = (
  value: string | undefined | null
): IconValue => {
  if (!value) return null;
  if (value.startsWith('{')) {
    try {
      const parsed = IconValueSchema.safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data;
    } catch {
      // Not our encoding after all; fall through and treat it as an emoji.
    }
  }
  return { type: 'emoji', unicode: value };
};

/**
 * Accepts a value in either form it can turn up in: the object the picker
 * writes, or the string `toJson` produces. Anything else reads as no icon.
 */
export const toIconValue = (value: unknown): IconValue => {
  if (typeof value === 'string') return decodeIconValue(value);
  if (value && typeof value === 'object') {
    const parsed = IconValueSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  return null;
};

/**
 * The colour ends up inside a `style` attribute, and an imported or synced
 * value is not guaranteed to come from the picker. Only the shapes the picker
 * produces (`var(--token)`) and plain colours get through; anything that could
 * carry a second declaration, such as `red;background:url(...)`, does not.
 */
const SAFE_COLOR =
  /^(?:var\(--[\w-]+(?:,\s*#[\da-f]{3,8})?\)|#[\da-f]{3,8}|[a-z]+)$/i;

export const safeIconColor = (color: string | undefined): string =>
  color && SAFE_COLOR.test(color) ? color : 'currentColor';
