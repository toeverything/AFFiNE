import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowDownBigIcon } from '@blocksuite/icons';
import type { FC } from 'react';
import { useCallback } from 'react';

import { Button } from '../../ui/button';

export const ContinueButton: FC<{
  onClick?: () => void;
  loading?: boolean;
}> = ({ onClick, loading }) => {
  const t = useAFFiNEI18N();

  return (
    <Button
      block={true}
      size="large"
      icon={
        <ArrowDownBigIcon
          width={20}
          height={20}
          style={{ transform: 'rotate(-90deg)', color: 'var(--affine-blue)' }}
        />
      }
      loading={loading}
      iconPosition="end"
      onClick={useCallback(() => {
        if (loading) return;
        onClick?.();
      }, [loading, onClick])}
    >
      {t['com.affine.auth.sign.email.continue']()}
    </Button>
  );
};
