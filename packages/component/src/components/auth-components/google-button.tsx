import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { GoogleDuotoneIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import type { FC, HTMLAttributes } from 'react';

import { googleButton } from './share.css';

export const GoogleButton: FC<HTMLAttributes<HTMLButtonElement>> = ({
  className,
  ...props
}) => {
  const t = useAFFiNEI18N();
  return (
    <button className={clsx(googleButton, className)} {...props}>
      <GoogleDuotoneIcon className="google-logo" />
      {t['Continue with Google']()}
    </button>
  );
};
