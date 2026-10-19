/** A bounded selection captured by the client before submitting a chat turn. */
export type EditorSelectionView = {
  editor_state_id: string;
  mode: 'page' | 'edgeless';
  content?: string;
  truncated?: boolean;
  block_ids?: string[];
  block_ids_truncated?: boolean;
  blocks?: Array<{
    id: string;
    flavour: string;
    text: { content: string; truncated: boolean };
    child_ids: string[];
    child_ids_truncated: boolean;
  }>;
  elements?: Array<Record<string, unknown>>;
  neighborhood?: unknown[];
};

export type EditorSelectionSnapshot = {
  version: 1;
  workspaceId: string;
  docId: string;
  readonly: boolean;
  views: {
    text: EditorSelectionView;
    markdown: EditorSelectionView;
    structure: EditorSelectionView;
  };
};

export class SelectionReadBudgetError extends Error {
  readonly code = 'SELECTION_READ_BUDGET_EXCEEDED';
  constructor() {
    super(
      "The marked selection exceeds AFFiNE's existing selection-read budget. No shortened selection was returned. Select less text or fewer blocks."
    );
    this.name = 'SelectionReadBudgetError';
  }
}

export function requireCompleteEditorSelection(view: EditorSelectionView) {
  const incomplete =
    view.truncated ||
    view.blocks?.some(block => block.text.truncated) ||
    view.elements?.some(element =>
      ['text', 'title'].some(
        key =>
          !!(element[key] as { truncated?: boolean } | undefined)?.truncated
      )
    );
  if (incomplete) throw new SelectionReadBudgetError();
  return view;
}

export function editorSelectionSnapshotState(
  snapshot: EditorSelectionSnapshot
) {
  const text = snapshot.views.text;
  return {
    editor_state_id: text.editor_state_id,
    mode: text.mode,
    readonly: snapshot.readonly,
    selection: {
      kind: text.mode === 'page' ? 'blocks' : 'elements',
      ids: text.block_ids ?? text.elements?.map(element => element.id) ?? [],
      truncated: text.block_ids_truncated ?? !!text.truncated,
    },
    capabilities: ['frontend_get_editor_state', 'frontend_read_selection'],
  };
}

/** Preserve the existing read budgets when serving an immutable selection. */
export function readEditorSelectionSnapshot(
  snapshot: EditorSelectionSnapshot,
  args: Record<string, unknown>
): EditorSelectionView {
  const format =
    args.format === 'text' || args.format === 'structure'
      ? args.format
      : 'markdown';
  const view: EditorSelectionView = JSON.parse(
    JSON.stringify(snapshot.views[format])
  );
  // This remains the existing host default. A model cannot choose the budget.
  const limit = 10_000;
  const clip = (text: { content: string; truncated: boolean }) => ({
    content: text.content.slice(0, limit),
    truncated: text.truncated || text.content.length > limit,
  });
  if (typeof view.content === 'string') {
    const text = clip({ content: view.content, truncated: !!view.truncated });
    view.content = text.content;
    view.truncated = text.truncated;
  }
  view.blocks = view.blocks?.map(block => ({
    ...block,
    text: clip(block.text),
  }));
  view.elements = view.elements?.map(element => {
    const result = { ...element };
    for (const key of ['text', 'title']) {
      const text = result[key] as
        | { content: string; truncated: boolean }
        | undefined;
      if (text) result[key] = clip(text);
    }
    return result;
  });
  return requireCompleteEditorSelection(view);
}
