import type { BlockSuiteRoot } from '@blocksuite/lit';

export const getSelectionString = (root: BlockSuiteRoot) => {
  const selection = root.selection.value
    .filter(sel => ['block', 'text'].includes(sel.type));
  if (!selection || selection.length === 0) return '';

  const json = selection.map(sel => sel.toJSON());
  return JSON.stringify(json);
}