import { IconButton, MuiClickAwayListener } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { MoreVerticalIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useTheme } from '@mui/material';
import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';

import { toast } from '../../../utils';
import { OperationMenu } from './OperationMenu';
import { PivotsMenu } from './PivotsMenu';

export const OperationButton = ({
  onAdd,
  onDelete,
  allMetas,
}: {
  onAdd: () => void;
  onDelete: () => void;
  allMetas: PageMeta[];
}) => {
  const {
    zIndex: { modal: modalIndex },
  } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const [pivotsMenuOpen, setPivotsMenuOpen] = useState(false);

  const menuIndex = useMemo(() => modalIndex + 1, [modalIndex]);

  const copyUrl = useCallback(() => {
    const workspaceId = router.query.workspaceId;
    navigator.clipboard.writeText(window.location.href);
    toast(t('Copied link to clipboard'));
  }, [router.query.workspaceId, t]);

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
        <IconButton
          ref={ref => setAnchorEl(ref)}
          size="small"
          className="operation-button"
          onClick={() => {
            setOperationOpen(!operationOpen);
          }}
        >
          <MoreVerticalIcon />
        </IconButton>
        <OperationMenu
          anchorEl={anchorEl}
          open={operationOpen}
          placement="bottom-start"
          zIndex={menuIndex}
          onSelect={type => {
            switch (type) {
              case 'add':
                onAdd();
                break;
              case 'move':
                setPivotsMenuOpen(true);
                break;
              case 'delete':
                onDelete();
                break;
            }
            setOperationOpen(false);
          }}
        />

        <PivotsMenu
          anchorEl={anchorEl}
          open={pivotsMenuOpen}
          placement="bottom-start"
          zIndex={menuIndex}
          allMetas={allMetas}
        />
      </div>
    </MuiClickAwayListener>
  );
};
