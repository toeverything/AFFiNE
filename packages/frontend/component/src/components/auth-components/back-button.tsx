import { useI18n } from '@affine/i18n';
import { ArrowLeftSmallIcon } from '@blocksuite/icons/rc';
import type { FC } from 'react';

import type { ButtonProps } from '../../ui/button';
import { Button } from '../../ui/button';

export const BackButton: FC<ButtonProps> = props => {
  const t = useI18n();
  return (
    <Button
      type="plain"
      style={{
        marginTop: 12,
        marginLeft: -5,
        paddingLeft: 0,
        paddingRight: 5,
        color: 'var(--affine-text-secondary-color)',
      }}
      icon={<ArrowLeftSmallIcon />}
      {...props}
    >
      {t['com.affine.backButton']()}
    </Button>
  );
};
