import { MenuItem, toast } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CopyIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import type { CommonMenuItemProps } from './types';

export const CopyLink = ({ onItemClick, onSelect }: CommonMenuItemProps) => {
  const t = useAFFiNEI18N();

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    toast(t['Copied link to clipboard']());
  }, [t]);

  return (
    <MenuItem
      data-testid="copy-link"
      onClick={() => {
        copyUrl();
        onItemClick?.();
        onSelect?.();
      }}
      icon={<CopyIcon />}
    >
      {t['Copy Link']()}
    </MenuItem>
  );
};
