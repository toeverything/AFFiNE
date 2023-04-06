import { MenuItem, MuiClickAwayListener, PureMenu } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  MoreVerticalIcon,
  MoveToIcon,
  PenIcon,
  PlusIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useTheme } from '@mui/material';
import { useMemo, useState } from 'react';

import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import { CopyLink, MoveToTrash } from '../../operation-menu-items';
import { PivotsMenu } from '../PivotsMenu/PivotsMenu';
import { StyledOperationButton } from '../styles';

export type OperationButtonProps = {
  onAdd: () => void;
  onDelete: () => void;
  metas: PageMeta[];
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  isHover: boolean;
  onRename?: () => void;
  onMenuClose?: () => void;
};
export const OperationButton = ({
  onAdd,
  onDelete,
  metas,
  currentMeta,
  blockSuiteWorkspace,
  isHover,
  onMenuClose,
  onRename,
}: OperationButtonProps) => {
  const {
    zIndex: { modal: modalIndex },
  } = useTheme();
  const { t } = useTranslation();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [operationMenuOpen, setOperationMenuOpen] = useState(false);
  const [pivotsMenuOpen, setPivotsMenuOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const menuIndex = useMemo(() => modalIndex + 1, [modalIndex]);
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);

  return (
    <MuiClickAwayListener
      onClickAway={() => {
        setOperationMenuOpen(false);
        setPivotsMenuOpen(false);
      }}
    >
      <div
        onClick={e => {
          e.stopPropagation();
        }}
        onMouseLeave={() => {
          setOperationMenuOpen(false);
          setPivotsMenuOpen(false);
        }}
      >
        <StyledOperationButton
          data-testid="pivot-operation-button"
          ref={ref => setAnchorEl(ref)}
          size="small"
          onClick={() => {
            setOperationMenuOpen(!operationMenuOpen);
          }}
          visible={isHover}
        >
          <MoreVerticalIcon />
        </StyledOperationButton>

        <PureMenu
          data-testid="pivot-operation-menu"
          width={256}
          anchorEl={anchorEl}
          open={operationMenuOpen}
          placement="bottom-start"
          zIndex={menuIndex}
        >
          <MenuItem
            data-testid="pivot-operation-add"
            onClick={() => {
              onAdd();
              setOperationMenuOpen(false);
              onMenuClose?.();
            }}
            icon={<PlusIcon />}
          >
            {t('Add a subpage inside')}
          </MenuItem>
          <MenuItem
            data-testid="pivot-operation-move-to"
            onClick={() => {
              setOperationMenuOpen(false);
              setPivotsMenuOpen(true);
            }}
            icon={<MoveToIcon />}
          >
            {t('Move to')}
          </MenuItem>
          <MenuItem
            data-testid="pivot-operation-rename"
            onClick={() => {
              onRename?.();
              setOperationMenuOpen(false);
              onMenuClose?.();
            }}
            icon={<PenIcon />}
          >
            {t('Rename')}
          </MenuItem>
          <MoveToTrash
            testId="pivot-operation-move-to-trash"
            onItemClick={() => {
              setOperationMenuOpen(false);
              setConfirmModalOpen(true);
              onMenuClose?.();
            }}
          />
          <CopyLink />
        </PureMenu>

        <PivotsMenu
          anchorEl={anchorEl}
          open={pivotsMenuOpen}
          placement="bottom-start"
          zIndex={menuIndex}
          metas={metas}
          currentMeta={currentMeta}
          blockSuiteWorkspace={blockSuiteWorkspace}
          showRemovePivots={true}
        />
        <MoveToTrash.ConfirmModal
          open={confirmModalOpen}
          meta={currentMeta}
          onConfirm={() => {
            toast(t('Moved to Trash'));
            setPageMeta(currentMeta.id, {
              trash: true,
              trashDate: +new Date(),
            });
            onDelete();
          }}
          onCancel={() => {
            setConfirmModalOpen(false);
          }}
          confirmButtonTestId="move-to-trash-confirm"
          cancelButtonTestId="move-to-trash-cancel"
        />
      </div>
    </MuiClickAwayListener>
  );
};
