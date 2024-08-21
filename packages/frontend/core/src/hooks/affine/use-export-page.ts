import { notify } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { track } from '@affine/core/mixpanel';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import type { PageRootService } from '@blocksuite/blocks';
import {
  HtmlTransformer,
  MarkdownTransformer,
  printToPdf,
} from '@blocksuite/blocks';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';

import { useAsyncCallback } from '../affine-async-hooks';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';

interface ExportHandlerOptions {
  page: Doc;
  editorContainer: AffineEditorContainer;
  type: ExportType;
}

async function exportHandler({
  page,
  type,
  editorContainer,
}: ExportHandlerOptions) {
  const editorRoot = document.querySelector('editor-host');
  let pageService: PageRootService | null = null;
  if (editorRoot) {
    pageService = editorRoot.spec.getService<PageRootService>('affine:page');
  }
  track.$.sharePanel.$.export({
    type,
  });
  switch (type) {
    case 'html':
      await HtmlTransformer.exportDoc(page);
      break;
    case 'markdown':
      await MarkdownTransformer.exportDoc(page);
      break;
    case 'pdf':
      await printToPdf(editorContainer);
      return;
    case 'png': {
      if (!pageService) return;
      await pageService.exportManager.exportPng();
      break;
    }
  }
}

export const useExportPage = () => {
  const editor = useService(EditorService).editor;
  const editorContainer = useLiveData(editor.editorContainer$);
  const blocksuiteDoc = editor.doc.blockSuiteDoc;
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const t = useI18n();

  const onClickHandler = useAsyncCallback(
    async (type: ExportType) => {
      if (editorContainer === null) return;

      // editor container is wrapped by a proxy, we need to get the origin
      const originEditorContainer = (editorContainer as any)
        .origin as AffineEditorContainer;

      const globalLoadingID = nanoid();
      pushGlobalLoadingEvent({
        key: globalLoadingID,
      });
      try {
        await exportHandler({
          page: blocksuiteDoc,
          type,
          editorContainer: originEditorContainer,
        });
        notify.success({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
        });
      } catch (err) {
        console.error(err);
        notify.error({
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
        });
      } finally {
        resolveGlobalLoadingEvent(globalLoadingID);
      }
    },
    [
      blocksuiteDoc,
      editorContainer,
      pushGlobalLoadingEvent,
      resolveGlobalLoadingEvent,
      t,
    ]
  );

  return onClickHandler;
};
