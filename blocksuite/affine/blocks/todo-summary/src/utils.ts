import { type ListBlockModel, NoteDisplayMode } from '@blocksuite/affine-model';
import type { BlockModel } from '@blocksuite/store';

const EMBED_BLOCK_PREFIX = 'affine:embed-';

export type TodoSummaryRow = {
  todoId: string;
  text: string;
  checked: boolean;
  nestingLevel: number;
};

export function createNestingIndicators(nestingLevel: number) {
  return Array.from({ length: nestingLevel }, (_, index) => index);
}

export function isTodoBlock(block: unknown): block is ListBlockModel {
  return (
    !!block &&
    (block as ListBlockModel).flavour === 'affine:list' &&
    (block as ListBlockModel).props.type === 'todo'
  );
}

export function collectPageTodoRows(
  root: BlockModel | null | undefined
): TodoSummaryRow[] {
  if (!root) {
    return [];
  }

  const rows: TodoSummaryRow[] = [];
  root.children.forEach(child => {
    if (!isVisibleNote(child)) {
      return;
    }

    child.children.forEach(noteChild => {
      walkBlockTree(noteChild, 0, rows);
    });
  });
  return rows;
}

export function insertTodoSummaryBlock(model: BlockModel) {
  const parent = model.store.getParent(model);
  if (!parent) {
    return;
  }

  const index = parent.children.indexOf(model);
  model.store.addBlock('affine:todo-summary', {}, parent, index + 1);

  if (model.text?.length === 0) {
    model.store.deleteBlock(model);
  }
}

function walkBlockTree(
  block: BlockModel,
  depth: number,
  rows: TodoSummaryRow[]
) {
  if (block.flavour.startsWith(EMBED_BLOCK_PREFIX)) {
    return;
  }

  if (isTodoBlock(block)) {
    rows.push({
      todoId: block.id,
      text: block.props.text?.toString() ?? '',
      checked: !!block.props.checked,
      nestingLevel: depth,
    });
  }

  block.children.forEach(child => {
    walkBlockTree(child, depth + 1, rows);
  });
}

function isVisibleNote(block: BlockModel) {
  return (
    block.flavour === 'affine:note' &&
    (block as { props: { displayMode?: NoteDisplayMode } }).props
      .displayMode !== NoteDisplayMode.EdgelessOnly
  );
}
