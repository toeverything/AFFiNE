import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export const TodoSummaryStatusFilters = ['all', 'done', 'not-done'] as const;

export type TodoSummaryStatusFilter = (typeof TodoSummaryStatusFilters)[number];

export type TodoSummaryBlockProps = {
  statusFilter: TodoSummaryStatusFilter;
  tagsFilter: string[];
};

export const TodoSummaryBlockSchema = defineBlockSchema({
  flavour: 'affine:todo-summary',
  props: (): TodoSummaryBlockProps => ({
    statusFilter: 'all',
    tagsFilter: [],
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note'],
    children: [],
  },
  toModel: () => new TodoSummaryBlockModel(),
});

export class TodoSummaryBlockModel extends BlockModel<TodoSummaryBlockProps> {}

export const TodoSummaryBlockSchemaExtension = BlockSchemaExtension(
  TodoSummaryBlockSchema
);
