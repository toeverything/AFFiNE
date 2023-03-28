import {
  IconButton,
  MenuItem,
  MuiClickAwayListener,
  PureMenu,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  CopyIcon,
  DeleteTemporarilyIcon,
  MoreVerticalIcon,
  MoveToIcon,
  PenIcon,
  PlusIcon,
} from '@blocksuite/icons';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';

import { toast } from '../../../../utils';

export const OperationButton = ({
  onAdd,
  onDelete,
}: {
  onAdd: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const [open, setOpen] = useState(false);
  const copyUrl = useCallback(() => {
    const workspaceId = router.query.workspaceId;
    navigator.clipboard.writeText(window.location.href);
    toast(t('Copied link to clipboard'));
  }, [router.query.workspaceId, t]);

  return (
    <MuiClickAwayListener
      onClickAway={() => {
        setOpen(false);
      }}
    >
      <div
        onClick={e => {
          e.stopPropagation();
        }}
        onMouseLeave={() => {
          setOpen(false);
        }}
      >
        <IconButton
          ref={ref => setAnchorEl(ref)}
          size="small"
          className="operation-button"
          onClick={event => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          <MoreVerticalIcon />
        </IconButton>
        <PureMenu
          anchorEl={anchorEl}
          placement="bottom-start"
          open={open && anchorEl !== null}
          zIndex={11111}
        >
          <MenuItem
            icon={<PlusIcon />}
            onClick={() => {
              onAdd();
              setOpen(false);
            }}
          >
            {t('Add a subpage inside')}
          </MenuItem>
          <MenuItem icon={<MoveToIcon />} disabled={true}>
            {t('Move to')}
          </MenuItem>
          <MenuItem icon={<PenIcon />} disabled={true}>
            {t('Rename')}
          </MenuItem>
          <MenuItem
            icon={<DeleteTemporarilyIcon />}
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            {t('Move to Trash')}
          </MenuItem>
          <MenuItem
            icon={<CopyIcon />}
            disabled={true}
            // onClick={() => {
            //   const workspaceId = router.query.workspaceId;
            //   navigator.clipboard.writeText(window.location.href);
            //   toast(t('Copied link to clipboard'));
            // }}
          >
            {t('Copy Link')}
          </MenuItem>
        </PureMenu>
      </div>
    </MuiClickAwayListener>
  );
};
