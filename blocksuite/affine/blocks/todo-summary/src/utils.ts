import { type ListBlockModel, NoteDisplayMode } from '@blocksuite/affine-model';
import type { BlockModel } from '@blocksuite/store';

const EMBED_BLOCK_PREFIX = 'affine:embed-';
const TODO_TAG_PATTERN = /#[^\s]+/g;
const todoSummaryStatusFilters = ['all', 'done', 'not-done'] as const;

type TodoSummaryStatusFilter = (typeof todoSummaryStatusFilters)[number];

export type TodoSummaryRow = {
  todoId: string;
  text: string;
  checked: boolean;
  nestingLevel: number;
  tags: string[];
};

export type TodoSummaryRowFilter = {
  statusFilter: TodoSummaryStatusFilter;
  selectedTags: string[];
  searchQuery: string;
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

export function filterTodoRows(
  rows: TodoSummaryRow[],
  { searchQuery, selectedTags, statusFilter }: TodoSummaryRowFilter
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const normalizedTags = normalizeTodoTags(selectedTags);

  return rows.filter(row => {
    if (statusFilter === 'done' && !row.checked) {
      return false;
    }

    if (statusFilter === 'not-done' && row.checked) {
      return false;
    }

    if (
      normalizedTags.length > 0 &&
      !normalizedTags.every(tag => row.tags.includes(tag))
    ) {
      return false;
    }

    if (
      normalizedSearch &&
      !row.text.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }

    return true;
  });
}

export function getTodoSummaryAvailableTags(rows: TodoSummaryRow[]) {
  return Array.from(new Set(rows.flatMap(row => row.tags))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function getTodoSummaryTagCounts(rows: TodoSummaryRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    row.tags.forEach(tag => {
      counts[tag] = (counts[tag] ?? 0) + 1;
    });
    return counts;
  }, {});
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
    const text = block.props.text?.toString() ?? '';
    rows.push({
      todoId: block.id,
      text,
      checked: !!block.props.checked,
      nestingLevel: depth,
      tags: extractTodoTags(text),
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

function extractTodoTags(text: string) {
  return normalizeTodoTags(
    Array.from(text.matchAll(TODO_TAG_PATTERN), match => match[0].slice(1))
  );
}

function normalizeTodoTags(tags: string[]) {
  return Array.from(
    new Set(
      tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)
    )
  );
}
