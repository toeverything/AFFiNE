import type { DocService, DocsService } from '@affine/core/modules/doc';
import type { EditorService } from '@affine/core/modules/editor';
import type { DocMode } from '@blocksuite/affine/model';
import {
  DocModeExtension,
  type DocModeProvider,
} from '@blocksuite/affine/shared/services';
import type { ExtensionType } from '@blocksuite/affine/store';

export function patchDocModeService(
  docService: DocService,
  docsService: DocsService,
  editorService: EditorService
): ExtensionType {
  const DEFAULT_MODE = 'page';
  class AffineDocModeService implements DocModeProvider {
    setEditorMode = (mode: DocMode) => {
      editorService.editor.setMode(mode);
    };
    getEditorMode = () => {
      return editorService.editor.mode$.value;
    };
    setPrimaryMode = (mode: DocMode, id?: string) => {
      if (id) {
        docsService.list.setPrimaryMode(id, mode);
      } else {
        docService.doc.setPrimaryMode(mode);
      }
    };
    getPrimaryMode = (id?: string) => {
      const mode = id
        ? docsService.list.getPrimaryMode(id)
        : docService.doc.getPrimaryMode();
      return (mode || DEFAULT_MODE) as DocMode;
    };
    togglePrimaryMode = (id?: string) => {
      const mode = id
        ? docsService.list.togglePrimaryMode(id)
        : docService.doc.togglePrimaryMode();
      return (mode || DEFAULT_MODE) as DocMode;
    };
    onPrimaryModeChange = (handler: (mode: DocMode) => void, id?: string) => {
      const mode$ = id
        ? docsService.list.primaryMode$(id)
        : docService.doc.primaryMode$;
      const sub = mode$.subscribe(m => handler((m || DEFAULT_MODE) as DocMode));
      return sub;
    };
  }

  const docModeExtension = DocModeExtension(new AffineDocModeService());

  return docModeExtension;
}
