import { MuiClickAwayListener } from '@affine/component';
import { MoreVerticalIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useTheme } from '@mui/material';
import { useMemo, useState } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import { OperationMenu } from './OperationMenu';
import { PivotsMenu } from './PivotsMenu/PivotsMenu';
import { StyledOperationButton } from './styles';

export type OperationButtonProps = {
  onAdd: () => void;
  onDelete: () => void;
  metas: PageMeta[];
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  isHover: boolean;
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
}: OperationButtonProps) => {
  const {
    zIndex: { modal: modalIndex },
  } = useTheme();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [operationOpen, setOperationOpen] = useState(false);
  const [pivotsMenuOpen, setPivotsMenuOpen] = useState(false);

  const menuIndex = useMemo(() => modalIndex + 1, [modalIndex]);

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
            onMenuClose?.();
          }}
          currentMeta={currentMeta}
          blockSuiteWorkspace={blockSuiteWorkspace}
        />

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
      </div>
    </MuiClickAwayListener>
  );
};
