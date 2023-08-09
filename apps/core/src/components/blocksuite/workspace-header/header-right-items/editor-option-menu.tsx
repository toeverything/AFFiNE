// fixme(himself65): refactor this file
import { FlexWrapper, Menu, MenuItem } from '@affine/component';
import { Export, MoveToTrash } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  EdgelessIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  ImportIcon,
  MoreVerticalIcon,
  PageIcon,
} from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { currentPageIdAtom } from '@toeverything/infra/atom';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';

import { pageSettingFamily } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { toast } from '../../../../utils';
import { HeaderDropDownButton } from '../../../pure/header-drop-down-button';
import { usePageHelper } from '../../block-suite-page-list/utils';
import { LanguageMenu } from './language-menu';
import { MenuThemeModeSwitch } from './theme-mode-switch';
const CommonMenu = () => {
  const content = (
    <div
      onClick={e => {
        e.stopPropagation();
      }}
    >
      <MenuThemeModeSwitch />
      <LanguageMenu />
    </div>
  );
  return (
    <FlexWrapper alignItems="center" justifyContent="center">
      <Menu
        content={content}
        placement="bottom"
        disablePortal={true}
        trigger="click"
      >
        <IconButton data-testid="editor-option-menu">
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </FlexWrapper>
  );
};

type PageMenuProps = {
  rename?: () => void;
};

export const PageMenu = ({ rename }: PageMenuProps) => {
  const t = useAFFiNEI18N();
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const pageId = useAtomValue(currentPageIdAtom);
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const [setting, setSetting] = useAtom(pageSettingFamily(pageId));
  const mode = setting?.mode ?? 'page';

  const favorite = pageMeta.favorite ?? false;
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [openConfirm, setOpenConfirm] = useState(false);
  const { removeToTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { importFile } = usePageHelper(blockSuiteWorkspace);
  const handleFavorite = useCallback(() => {
    setPageMeta(pageId, { favorite: !favorite });
    toast(favorite ? t['Removed from Favorites']() : t['Added to Favorites']());
  }, [favorite, pageId, setPageMeta, t]);
  const handleSwitchMode = useCallback(() => {
    setSetting(setting => ({
      mode: setting?.mode === 'page' ? 'edgeless' : 'page',
    }));
    toast(
      mode === 'page'
        ? t['com.affine.edgelessMode']()
        : t['com.affine.pageMode']()
    );
  }, [mode, setSetting, t]);
  const handleOnConfirm = useCallback(() => {
    removeToTrash(pageMeta.id);
    toast(t['Moved to Trash']());
    setOpenConfirm(false);
  }, [pageMeta.id, removeToTrash, t]);
  const menuItemStyle = {
    padding: '4px 12px',
  };
  const EditMenu = (
    <>
      <MenuItem
        icon={<EditIcon />}
        data-testid="editor-option-menu-rename"
        onClick={rename}
        style={menuItemStyle}
      >
        {t['Rename']()}
      </MenuItem>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PageIcon />}
        data-testid="editor-option-menu-edgeless"
        onClick={handleSwitchMode}
        style={menuItemStyle}
      >
        {t['Convert to ']()}
        {mode === 'page' ? t['Edgeless']() : t['Page']()}
      </MenuItem>
      <MenuItem
        data-testid="editor-option-menu-favorite"
        onClick={handleFavorite}
        style={menuItemStyle}
        icon={
          favorite ? (
            <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
          ) : (
            <FavoriteIcon />
          )
        }
      >
        {favorite ? t['Remove from favorites']() : t['Add to Favorites']()}
      </MenuItem>
      {/* {TODO: add tag and duplicate function support} */}
      {/* <MenuItem
        icon={<TagsIcon />}
        data-testid="editor-option-menu-add-tag"
        onClick={() => {}}
        style={menuItemStyle}
      >
        {t['com.affine.header.option.add-tag']()}
      </MenuItem> */}
      <Divider />
      {/* <MenuItem
        icon={<DuplicateIcon />}
        data-testid="editor-option-menu-duplicate"
        onClick={() => {}}
        style={menuItemStyle}
      >
        {t['com.affine.header.option.duplicate']()}
      </MenuItem> */}
      <MenuItem
        icon={<ImportIcon />}
        data-testid="editor-option-menu-import"
        onClick={importFile}
        style={menuItemStyle}
      >
        {t['Import']()}
      </MenuItem>
      <Export />
      <Divider />
      <MoveToTrash
        data-testid="editor-option-menu-delete"
        onItemClick={() => {
          setOpenConfirm(true);
        }}
      />
    </>
  );

  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center">
        <Menu
          content={EditMenu}
          placement="bottom-end"
          disablePortal={true}
          trigger="click"
          menuStyles={{
            borderRadius: '8px',
            padding: '8px',
            background: 'var(--affine-background-overlay-panel-color)',
          }}
        >
          <div>
            <HeaderDropDownButton />
          </div>
        </Menu>
        <MoveToTrash.ConfirmModal
          open={openConfirm}
          title={pageMeta.title}
          onConfirm={handleOnConfirm}
          onCancel={() => {
            setOpenConfirm(false);
          }}
        />
      </FlexWrapper>
    </>
  );
};
export const EditorOptionMenu = () => {
  const { pageId } = useParams();
  return pageId ? <PageMenu /> : <CommonMenu />;
};
