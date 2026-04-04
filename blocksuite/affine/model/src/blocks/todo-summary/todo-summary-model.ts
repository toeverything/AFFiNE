import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export const TodoSummaryBlockSchema = defineBlockSchema({
  flavour: 'affine:todo-summary',
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note'],
    children: [],
  },
  toModel: () => new TodoSummaryBlockModel(),
});

export class TodoSummaryBlockModel extends BlockModel<Record<string, never>> {}

export const TodoSummaryBlockSchemaExtension = BlockSchemaExtension(
  TodoSummaryBlockSchema
);
