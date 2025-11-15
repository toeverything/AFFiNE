import type { ExtensionType, Schema, Workspace } from '@blocksuite/store';

import {
  ImportDoc,
  type OnFailHandler,
  type OnSuccessHandler,
} from './import-doc.js';

export function showImportModal({
  schema,
  collection,
  extensions,
  onSuccess,
  onFail,
  container = document.body,
  abortController = new AbortController(),
}: {
  schema: Schema;
  collection: Workspace;
  extensions: ExtensionType[];
  onSuccess?: OnSuccessHandler;
  onFail?: OnFailHandler;
  multiple?: boolean;
  container?: HTMLElement;
  abortController?: AbortController;
}) {
  const importDoc = new ImportDoc(
    collection,
    schema,
    extensions,
    onSuccess,
    onFail,
    abortController
  );
  container.append(importDoc);
  abortController.signal.addEventListener('abort', () => importDoc.remove());
  return importDoc;
}
