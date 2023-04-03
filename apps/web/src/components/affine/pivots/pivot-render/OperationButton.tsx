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
  const [operationOpen, setOperationOpen] = useState(false);
  const [pivotsMenuOpen, setPivotsMenuOpen] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const menuIndex = useMemo(() => modalIndex + 1, [modalIndex]);
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);

  return (
    <MuiClickAwayListener
      onClickAway={() => {
        setOperationOpen(false);
        setPivotsMenuOpen(false);
      }}
    >
      <div
        onClick={e => {
          e.stopPropagation();
        }}
        onMouseLeave={() => {
          setOperationOpen(false);
          setPivotsMenuOpen(false);
        }}
      >
        <StyledOperationButton
          ref={ref => setAnchorEl(ref)}
          size="small"
          onClick={() => {
            setOperationOpen(!operationOpen);
          }}
          visible={isHover}
        >
          <MoreVerticalIcon />
        </StyledOperationButton>

        <PureMenu
          width={256}
          anchorEl={anchorEl}
          open={operationOpen}
          placement="bottom-start"
          zIndex={menuIndex}
        >
          <MenuItem
            onClick={() => {
              onAdd();
              setOperationOpen(false);
              onMenuClose?.();
            }}
            icon={<PlusIcon />}
          >
            {t('Add a subpage inside')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOperationOpen(false);
              setPivotsMenuOpen(true);
            }}
            icon={<MoveToIcon />}
          >
            {t('Move to')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onRename?.();
              setOperationOpen(false);
              onMenuClose?.();
            }}
            icon={<PenIcon />}
          >
            {t('Rename')}
          </MenuItem>
          <MoveToTrash
            onItemClick={() => {
              setOperationOpen(false);
              setOpenConfirm(true);
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
          open={openConfirm}
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
            setOpenConfirm(false);
          }}
        />
      </div>
    </MuiClickAwayListener>
  );
};
