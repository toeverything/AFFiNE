import { createIdentifier } from '@blocksuite/global/di';
import type { EditorHost } from '@blocksuite/std';

export const EditorHostKey = createIdentifier<EditorHost>('editor-host');
