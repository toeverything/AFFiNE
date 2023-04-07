import { MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { ArrowRightSmallIcon, MoveToIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useMemo, useRef, useState } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import { PinboardMenu } from '../pinboard';
import type { CommonMenuItemProps } from './types';

export type MoveToProps = CommonMenuItemProps<{
  dragId: string;
  dropId: string;
}> & {
  metas: PageMeta[];
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
};

export const MoveTo = ({
  metas,
  currentMeta,
  blockSuiteWorkspace,
  onSelect,
  onItemClick,
}: MoveToProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = anchorEl !== null;
  return (
    <>
      <MenuItem
        ref={ref}
        onClick={e => {
          e.stopPropagation();
          setAnchorEl(ref.current);
          onItemClick?.();
        }}
        icon={<MoveToIcon />}
        endIcon={<ArrowRightSmallIcon />}
        data-testid="move-to-menu-item"
      >
        {t('Move to')}
      </MenuItem>
      <PinboardMenu
        anchorEl={anchorEl}
        open={open}
        placement="left-start"
        metas={useMemo(
          () => metas.filter(m => !m.trash && m.id !== currentMeta.id),
          [metas, currentMeta]
        )}
        currentMeta={currentMeta}
        blockSuiteWorkspace={blockSuiteWorkspace}
        onPinboardClick={onSelect}
      />
    </>
  );
};
