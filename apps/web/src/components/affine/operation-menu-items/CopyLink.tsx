import { MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { CopyIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

//
import { toast } from '../../../utils';
import type { CommonMenuItemProps } from './types';

export const CopyLink = ({ onItemClick, onSelect }: CommonMenuItemProps) => {
  const { t } = useTranslation();

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    toast(t('Copied link to clipboard'));
  }, [t]);

  return (
    <>
      <MenuItem
        onClick={() => {
          copyUrl();
          onItemClick?.();
          onSelect?.();
        }}
        icon={<CopyIcon />}
      >
        {t('Copy Link')}
      </MenuItem>
    </>
  );
};
