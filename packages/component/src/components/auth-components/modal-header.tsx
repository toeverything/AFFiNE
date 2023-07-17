import { AffineLogoSBlue2_1Icon } from '@blocksuite/icons';
import type { FC } from 'react';

import { modalHeaderWrapper } from './share.css';
export const ModalHeader: FC<{
  title: string;
  subTitle: string;
}> = ({ title, subTitle }) => {
  return (
    <div className={modalHeaderWrapper}>
      <p>
        <AffineLogoSBlue2_1Icon className="logo" />
        {title}
      </p>
      <p>{subTitle}</p>
    </div>
  );
};
