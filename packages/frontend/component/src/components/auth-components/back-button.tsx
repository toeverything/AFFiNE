import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon } from '@blocksuite/icons';
import { type FC } from 'react';

import { Button, type ButtonProps } from '../../ui/button';

export const BackButton: FC<ButtonProps> = props => {
  const t = useAFFiNEI18N();
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
