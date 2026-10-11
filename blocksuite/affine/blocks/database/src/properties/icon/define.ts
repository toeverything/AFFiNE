import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

export const iconColumnType = propertyType('icon');

/**
 * Mirrors `IconData` from the shared icon-picker service, kept loose so a
 * value written by a newer picker still round-trips instead of being dropped
 * by the schema.
 */
export const IconValueSchema = zod
  .object({
    type: zod.string(),
    unicode: zod.string().optional(),
    name: zod.string().optional(),
    color: zod.string().optional(),
  })
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
const encodeIconValue = (value: IconValue | undefined): string => {
  if (!value) return '';
  if (value.type === 'emoji' && value.unicode) return value.unicode;
  return JSON.stringify(value);
};

const decodeIconValue = (value: string | undefined | null): IconValue => {
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
 * A per-row icon, the way every row in the plan this mirrors is a page with
 * its own emoji. Relation chips read it, so an icon set once shows up
 * everywhere that row is referenced.
 */
export const iconPropertyModelConfig = iconColumnType.modelConfig({
  name: 'Icon',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.string(),
    type: () => t.string.instance(),
    isEmpty: ({ value }) => !value,
  },
  rawValue: {
    schema: IconValueSchema,
    default: () => null,
      // toString stays human-readable: it is what lands in a text clipboard,
      // and a glyph has no character to put there.
      toString: ({ value }) =>
        value?.type === 'emoji' ? (value.unicode ?? '') : '',
      fromString: ({ value }) => ({ value: decodeIconValue(value) }),
      toJson: ({ value }) => encodeIconValue(value),
      fromJson: ({ value }) => decodeIconValue(value),
  },
  minWidth: 44,
});
