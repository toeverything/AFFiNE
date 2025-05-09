import { createContextKey } from '@blocksuite/data-view';
import type { EditorHost } from '@blocksuite/std';

export const HostContextKey = createContextKey<EditorHost | undefined>(
  'editor-host',
  undefined
);
