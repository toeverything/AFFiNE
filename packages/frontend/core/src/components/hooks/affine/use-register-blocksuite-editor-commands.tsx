import { toast } from '@affine/component';
import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@affine/core/commands';
import type { Editor } from '@affine/core/modules/editor';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { EdgelessIcon, HistoryIcon, PageIcon } from '@blocksuite/icons/rc';
import {
  DocService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { pageHistoryModalAtom } from '../../../components/atoms/page-history';
import { useInfoModal } from '../../affine/page-properties';
import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';
import { useExportPage } from './use-export-page';
import { useTrashModalHelper } from './use-trash-modal-helper';

export function useRegisterBlocksuiteEditorCommands(editor: Editor) {
  const doc = useService(DocService).doc;
  const docId = doc.id;
  const mode = useLiveData(editor.mode$);
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;

  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const favorite = useLiveData(favAdapter.isFavorite$(docId, 'doc'));
  const trash = useLiveData(doc.trash$);

  const setPageHistoryModalState = useSetAtom(pageHistoryModalAtom);
  const openInfo = useInfoModal(docId);

  const openHistoryModal = useCallback(() => {
    setPageHistoryModalState(() => ({
      pageId: docId,
      open: true,
    }));
  }, [docId, setPageHistoryModalState]);

  const openInfoModal = useCallback(() => {
    openInfo();
  }, [openInfo]);

  const { duplicate } = useBlockSuiteMetaHelper();
  const exportHandler = useExportPage();
  const { setTrashModal } = useTrashModalHelper();
  const onClickDelete = useCallback(
    (title: string) => {
      setTrashModal({
        open: true,
        pageIds: [docId],
        pageTitles: [title],
      });
    },
    [docId, setTrashModal]
  );

  const isCloudWorkspace = workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const preconditionStrategy = () =>
      PreconditionStrategy.InPaperOrEdgeless && !trash;

    // TODO(@Peng): add back when edgeless presentation is ready

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
        id: `editor:${mode}-view-info`,
        preconditionStrategy: () =>
          PreconditionStrategy.InPaperOrEdgeless && !trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.page-properties.page-info.view'](),
        run() {
          track.$.cmdk.docInfo.open();

          openInfoModal();
        },
      })
    );

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
          favAdapter.toggle(docId, 'doc');
          track.$.cmdk.editor.toggleFavorite();

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
          track.$.cmdk.editor.switchPageMode({
            mode: mode === 'page' ? 'edgeless' : 'page',
          });

          editor.toggleMode();
          toast(
            mode === 'page'
              ? t['com.affine.toastMessage.edgelessMode']()
              : t['com.affine.toastMessage.pageMode']()
          );
        },
      })
    );

    // TODO(@Peng): should not show duplicate for journal
    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-duplicate`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.header.option.duplicate'](),
        run() {
          duplicate(docId);
          track.$.cmdk.editor.createDoc({
            control: 'duplicate',
          });
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-pdf`,
        preconditionStrategy: () => mode === 'page' && !trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PDF'](),
        async run() {
          track.$.cmdk.editor.export({
            type: 'pdf',
          });

          exportHandler('pdf');
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
          track.$.cmdk.editor.export({
            type: 'html',
          });

          exportHandler('html');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-png`,
        preconditionStrategy: () => mode === 'page' && !trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PNG'](),
        async run() {
          track.$.cmdk.editor.export({
            type: 'png',
          });

          exportHandler('png');
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
          track.$.cmdk.editor.export({
            type: 'markdown',
          });

          exportHandler('markdown');
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
          track.$.cmdk.editor.deleteDoc();

          onClickDelete(doc.title$.value);
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
          track.$.cmdk.editor.restoreDoc();

          doc.restoreFromTrash();
        },
      })
    );

    if (isCloudWorkspace) {
      unsubs.push(
        registerAffineCommand({
          id: `editor:${mode}-page-history`,
          category: `editor:${mode}`,
          icon: <HistoryIcon />,
          label: t['com.affine.cmdk.affine.editor.reveal-page-history-modal'](),
          run() {
            track.$.cmdk.docHistory.open();

            openHistoryModal();
          },
        })
      );
    }

    unsubs.push(
      registerAffineCommand({
        id: 'alert-ctrl-s',
        category: 'affine:general',
        preconditionStrategy: PreconditionStrategy.Never,
        keyBinding: {
          binding: '$mod+s',
        },
        label: '',
        icon: null,
        run() {
          toast(t['Save']());
        },
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [
    editor,
    favorite,
    mode,
    onClickDelete,
    exportHandler,
    t,
    trash,
    isCloudWorkspace,
    openHistoryModal,
    duplicate,
    favAdapter,
    docId,
    doc,
    openInfoModal,
  ]);
}
