import React, { PropsWithChildren, useState } from 'react';
import {
  StyledHeader,
  StyledHeaderRightSide,
  StyledHeaderContainer,
  StyledBrowserWarning,
  StyledCloseButton,
} from './styles';
import {
  ExportIcon,
  EdgelessIcon,
  PaperIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  MoreVerticalIcon,
  FavouritesIcon,
  FavouritedIcon,
  TrashIcon,
} from '@blocksuite/icons';
import { useEditor } from '@/providers/editor-provider';
import { useAppState } from '@/providers/app-state-provider/context';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import { IconButton, Button } from '@/ui/button';
import CloseIcon from '@mui/icons-material/Close';
import { getWarningMessage, shouldShowWarning } from './utils';
import { Menu, MenuItem } from '@/ui/menu';
import { useRouter } from 'next/router';
import { useConfirm } from '@/providers/confirm-provider';
import { SyncIcon } from './sync-icon';
import { toast } from '@/components/toast';

const PopoverContent = () => {
  const { getPageMeta, editor, currentPage } = useAppState();
  const { mode, setMode, toggleFavoritePage, toggleDeletePage } = useEditor();
  const { confirm } = useConfirm();

  const { id, favorite, title } = (currentPage?.id
    ? getPageMeta(currentPage.id)
    : null) ?? {
    id: '',
    favorite: false,
    title: '',
  };

  return (
    <>
      <MenuItem
        onClick={() => {
          toggleFavoritePage(id);
        }}
        icon={favorite ? <FavouritedIcon /> : <FavouritesIcon />}
      >
        {favorite ? 'Remove' : 'Add'} to favourites
      </MenuItem>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
        onClick={() => {
          setMode(mode === 'page' ? 'edgeless' : 'page');
        }}
      >
        Convert to {mode === 'page' ? 'Edgeless' : 'Page'}
      </MenuItem>
      <Menu
        placement="left-start"
        content={
          <>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportHtml();
              }}
              icon={<ExportToHtmlIcon />}
            >
              Export to HTML
            </MenuItem>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportMarkdown();
              }}
              icon={<ExportToMarkdownIcon />}
            >
              Export to Markdown
            </MenuItem>
          </>
        }
      >
        <MenuItem icon={<ExportIcon />} isDir={true}>
          Export
        </MenuItem>
      </Menu>
      <MenuItem
        onClick={() => {
          confirm({
            title: 'Delete page?',
            content: `${title || 'Untitled'} will be moved to Trash`,
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
            toast('Moved to Trash');
          });
        }}
        icon={<TrashIcon />}
      >
        Delete
      </MenuItem>
    </>
  );
};

const BrowserWarning = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  return (
    <StyledBrowserWarning show={show}>
      {getWarningMessage()}
      <StyledCloseButton onClick={onClose}>
        <CloseIcon />
      </StyledCloseButton>
    </StyledBrowserWarning>
  );
};

const HeaderRight = () => {
  const { pageList, toggleDeletePage, permanentlyDeletePage } = useEditor();
  const { confirm } = useConfirm();
  const router = useRouter();
  const currentPageMeta = pageList.find(p => p.id === router.query.pageId);
  const isTrash = !!currentPageMeta?.trash;

  if (isTrash) {
    const { id } = currentPageMeta;
    return (
      <>
        <Button
          bold={true}
          shape="round"
          style={{ marginRight: '24px' }}
          onClick={() => {
            toggleDeletePage(id);
          }}
        >
          Restore it
        </Button>
        <Button
          bold={true}
          shape="round"
          type="danger"
          onClick={() => {
            confirm({
              title: 'Permanently delete',
              content:
                "Once deleted, you can't undo this action. Do you confirm?",
              confirmText: 'Delete',
              confirmType: 'danger',
            }).then(confirm => {
              if (confirm) {
                router.push({ pathname: '/page-list/all' });
                permanentlyDeletePage(id);
              }
            });
          }}
        >
          Delete permanently
        </Button>
      </>
    );
  }
  return (
    <>
      <SyncIcon />
      <ThemeModeSwitch />
      <Menu content={<PopoverContent />} placement="bottom-end">
        <IconButton>
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </>
  );
};

export const Header = ({ children }: PropsWithChildren<{}>) => {
  const [showWarning, setShowWarning] = useState(shouldShowWarning());

  return (
    <StyledHeaderContainer hasWarning={showWarning}>
      <BrowserWarning
        show={showWarning}
        onClose={() => {
          setShowWarning(false);
        }}
      />
      <StyledHeader hasWarning={showWarning}>
        {children}
        <StyledHeaderRightSide>
          <HeaderRight />
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};

export default Header;
