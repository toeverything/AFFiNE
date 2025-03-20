import { propertyType, t } from '@blocksuite/affine/blocks/database';
import zod from 'zod';

export const fileColumnType = propertyType('attachment');

export const FileItemSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  mime: zod.string().optional(),
  order: zod.string(),
});

export type FileItemType = zod.TypeOf<typeof FileItemSchema>;
const FileCellRawValueTypeSchema = zod.record(zod.string(), FileItemSchema);
export const FileCellJsonValueTypeSchema = zod.array(zod.string());
export type FileCellRawValueType = zod.TypeOf<
  typeof FileCellRawValueTypeSchema
>;
export type FileCellJsonValueType = zod.TypeOf<
  typeof FileCellJsonValueTypeSchema
>;
export const filePropertyModelConfig = fileColumnType.modelConfig({
  name: 'Attachment',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  rawValue: {
    schema: FileCellRawValueTypeSchema,
    default: () => ({}) as FileCellRawValueType,
    fromString: () => ({
      value: {},
    }),
    toString: ({ value }) =>
      Object.values(value ?? {})
        ?.map(v => v.name)
        .join(',') ?? '',
    toJson: ({ value }) => Object.values(value ?? {}).map(v => v.name),
  },
  jsonValue: {
    schema: FileCellJsonValueTypeSchema,
    type: () => t.array.instance(t.string.instance()),
    isEmpty: ({ value }) => value.length === 0,
  },
});
