import { IconButton, toast } from '@affine/component';
import {
  MenuSeparator,
  MobileMenu,
  MobileMenuItem,
} from '@affine/component/ui/menu';
import { useFavorite } from '@affine/core/components/blocksuite/block-suite-header/favorite';
import { IsFavoriteIcon } from '@affine/core/components/pure/icons';
import { track } from '@affine/core/mixpanel';
import { EditorService } from '@affine/core/modules/editor';
import { EditorOutlinePanel } from '@affine/core/pages/workspace/detail-page/tabs/outline';
import { preventDefault } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import {
  EdgelessIcon,
  InformationIcon,
  MoreHorizontalIcon,
  PageIcon,
  TocIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import * as styles from './page-header-more-button.css';
import { DocInfoSheet } from './sheets/doc-info';

type PageMenuProps = {
  docId: string;
};

export const PageHeaderMenuButton = ({ docId }: PageMenuProps) => {
  const t = useI18n();

  const editorService = useService(EditorService);
  const editorContainer = useLiveData(editorService.editor.editorContainer$);

  const isInTrash = useLiveData(
    editorService.editor.doc.meta$.map(meta => meta.trash)
  );
  const currentMode = useLiveData(editorService.editor.mode$);

  const { favorite, toggleFavorite } = useFavorite(docId);

  const handleSwitchMode = useCallback(() => {
    editorService.editor.toggleMode();
    track.$.header.docOptions.switchPageMode({
      mode: currentMode === 'page' ? 'edgeless' : 'page',
    });
    toast(
      currentMode === 'page'
        ? t['com.affine.toastMessage.edgelessMode']()
        : t['com.affine.toastMessage.pageMode']()
    );
  }, [currentMode, editorService, t]);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      track.$.header.docOptions.open();
    }
  }, []);

  const handleToggleFavorite = useCallback(() => {
    track.$.header.docOptions.toggleFavorite();
    toggleFavorite();
  }, [toggleFavorite]);

  const EditMenu = (
    <>
      <MobileMenuItem
        prefixIcon={currentMode === 'page' ? <EdgelessIcon /> : <PageIcon />}
        data-testid="editor-option-menu-edgeless"
        onSelect={handleSwitchMode}
      >
        {t['Convert to ']()}
        {currentMode === 'page'
          ? t['com.affine.pageMode.edgeless']()
          : t['com.affine.pageMode.page']()}
      </MobileMenuItem>
      <MobileMenuItem
        data-testid="editor-option-menu-favorite"
        onSelect={handleToggleFavorite}
        prefixIcon={<IsFavoriteIcon favorite={favorite} />}
      >
        {favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add']()}
      </MobileMenuItem>
      <MenuSeparator />
      <MobileMenu items={<DocInfoSheet docId={docId} />}>
        <MobileMenuItem
          prefixIcon={<InformationIcon />}
          onClick={preventDefault}
        >
          <span>{t['com.affine.page-properties.page-info.view']()}</span>
        </MobileMenuItem>
      </MobileMenu>
      <MobileMenu
        items={
          <div className={styles.outlinePanel}>
            <EditorOutlinePanel editor={editorContainer} />
          </div>
        }
      >
        <MobileMenuItem prefixIcon={<TocIcon />} onClick={preventDefault}>
          <span>{t['com.affine.header.option.view-toc']()}</span>
        </MobileMenuItem>
      </MobileMenu>
    </>
  );
  if (isInTrash) {
    return null;
  }
  return (
    <MobileMenu
      items={EditMenu}
      contentOptions={{
        align: 'center',
      }}
      rootOptions={{
        onOpenChange: handleMenuOpenChange,
      }}
    >
      <IconButton
        size={24}
        data-testid="header-dropDownButton"
        className={styles.iconButton}
      >
        <MoreHorizontalIcon />
      </IconButton>
    </MobileMenu>
  );
};
