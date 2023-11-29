import { toast } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { Workspace } from '@blocksuite/store';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';
import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@toeverything/infra/command';
import { useCallback, useEffect } from 'react';

import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';
import { useExportPage } from './use-export-page';
import { useTrashModalHelper } from './use-trash-modal-helper';

export function useRegisterBlocksuiteEditorCommands(
  blockSuiteWorkspace: Workspace,
  pageId: string,
  mode: 'page' | 'edgeless'
) {
  const t = useAFFiNEI18N();
  const { getPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const currentPage = blockSuiteWorkspace.getPage(pageId);
  assertExists(currentPage);
  const pageMeta = getPageMeta(pageId);
  assertExists(pageMeta);
  const favorite = pageMeta.favorite ?? false;
  const trash = pageMeta.trash ?? false;

  const { togglePageMode, toggleFavorite, restoreFromTrash } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const exportHandler = useExportPage(currentPage);
  const { setTrashModal } = useTrashModalHelper(blockSuiteWorkspace);
  const onClickDelete = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [pageMeta.title],
    });
  }, [pageId, pageMeta.title, setTrashModal]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const preconditionStrategy = () =>
      PreconditionStrategy.InPaperOrEdgeless && !trash;

    //TODO: add back when edgeless presentation is ready

    // this is pretty hack and easy to break. need a better way to communicate with blocksuite editor
    // unsubs.push(
    //   registerAffineCommand({
    //     id: 'editor:edgeless-presentation-start',
    //     preconditionStrategy: () => PreconditionStrategy.InEdgeless && !trash,
    //     category: 'editor:edgeless',
    //     icon: <EdgelessIcon />,
    //     label: t['com.affine.cmdk.affine.editor.edgeless.presentation-start'](),
    //     run() {
    //       document
    //         .querySelector<HTMLElement>('edgeless-toolbar')
    //         ?.shadowRoot?.querySelector<HTMLElement>(
    //           '.edgeless-toolbar-left-part > edgeless-tool-icon-button:last-child'
    //         )
    //         ?.click();
    //     },
    //   })
    // );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-${favorite ? 'remove-from' : 'add-to'}-favourites`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add'](),
        run() {
          toggleFavorite(pageId);
          toast(
            favorite
              ? t['com.affine.cmdk.affine.editor.remove-from-favourites']()
              : t['com.affine.cmdk.affine.editor.add-to-favourites']()
          );
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-convert-to-${
          mode === 'page' ? 'edgeless' : 'page'
        }`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: `${t['Convert to ']()}${
          mode === 'page'
            ? t['com.affine.pageMode.edgeless']()
            : t['com.affine.pageMode.page']()
        }`,
        run() {
          togglePageMode(pageId);
          toast(
            mode === 'page'
              ? t['com.affine.toastMessage.edgelessMode']()
              : t['com.affine.toastMessage.pageMode']()
          );
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-pdf`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PDF'](),
        async run() {
          await exportHandler('pdf');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-html`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to HTML'](),
        async run() {
          await exportHandler('html');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-png`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PNG'](),
        async run() {
          await exportHandler('png');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-markdown`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to Markdown'](),
        async run() {
          await exportHandler('markdown');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-move-to-trash`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.moveToTrash.title'](),
        run() {
          onClickDelete();
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-restore-from-trash`,
        preconditionStrategy: () =>
          PreconditionStrategy.InPaperOrEdgeless && trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.cmdk.affine.editor.restore-from-trash'](),
        run() {
          restoreFromTrash(pageId);
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [
    favorite,
    mode,
    onClickDelete,
    exportHandler,
    pageId,
    pageMeta.title,
    restoreFromTrash,
    t,
    toggleFavorite,
    togglePageMode,
    trash,
  ]);
}
