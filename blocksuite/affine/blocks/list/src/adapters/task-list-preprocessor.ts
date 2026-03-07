import { MarkdownPreprocessorExtension } from '@blocksuite/affine-shared/adapters';

/**
 * Normalises non-standard GFM task list markers per FR-025a.
 *
 * Obsidian and other tools use additional check states such as:
 *   - [/] (in-progress)  → treat as checked
 *   - [-] (cancelled)    → treat as checked
 *   - [~] (dropped)      → treat as checked
 *   - [>] (forwarded)    → treat as checked
 *   - [!] (important)    → treat as checked
 *
 * Any non-space, non-empty character in `[ ]` is treated as checked.
 * Standard GFM `[x]` / `[X]` (already correct) and `[ ]` (unchecked) are
 * left untouched.
 *
 * This preprocessor runs on the raw Markdown string before remark parses it,
 * so it converts `- [/] item` → `- [x] item` for remark's task list parser.
 */
function normaliseTaskListMarkers(content: string): string {
  // Match `- [<char>]` or `* [<char>]` at line start (with optional indent).
  // Captures: <char> must be a single non-space character that is NOT x/X.
  // `[ ]` (space = unchecked) and `[x]`/`[X]` (standard checked) are skipped.
  return content.replace(
    /^(\s*[-*+]\s+)\[([^ xX])\]/gm,
    (_match, prefix) => `${prefix}[x]`
  );
}

export const TaskListNormalisationPreprocessorExtension =
  MarkdownPreprocessorExtension({
    name: 'task-list-normalisation',
    preprocess: normaliseTaskListMarkers,
  });
