import type { ListBlockModel } from '@blocksuite/affine-model';
import type { TaskWorkflowDefaults } from '@blocksuite/affine-shared/services';

export const getTodoConfigFromProvider = (
  provider: ListBlockModel,
  defaults: TaskWorkflowDefaults['list']
) => ({
  fieldDefs:
    provider.props.todoFieldDefs$?.value ??
    provider.props.todoFieldDefs ??
    defaults.fieldDefs,
  layout:
    provider.props.todoFieldLayout$?.value ??
    provider.props.todoFieldLayout ??
    defaults.fieldLayout,
});
