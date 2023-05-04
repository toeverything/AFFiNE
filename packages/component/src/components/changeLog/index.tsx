import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useState } from 'react';

import { IconButton } from '../..';
import {
  changeLogSlideInStyle,
  changeLogSlideOutStyle,
  changeLogWrapperSlideInStyle,
  changeLogWrapperSlideOutStyle,
  iconButtonStyle,
  iconStyle,
  linkStyle,
} from './index.css';

type ChangeLogProps = {
  onCloseWhatsNew: () => void;
};
export const ChangeLog = (props: ChangeLogProps) => {
  const { onCloseWhatsNew } = props;
  const [isClose, setIsClose] = useState(false);
  const t = useAFFiNEI18N();
  const handleClose = () => {
    setIsClose(true);
    onCloseWhatsNew();
  };
  return (
    <div
      className={clsx(changeLogWrapperSlideInStyle, {
        [changeLogWrapperSlideOutStyle]: isClose,
      })}
    >
      <div
        data-testid="change-log"
        className={clsx(changeLogSlideInStyle, {
          [changeLogSlideOutStyle]: isClose,
        })}
      >
        <div
          className={linkStyle}
          onClick={() => {
            window.open(
              'https://github.com/toeverything/AFFiNE/releases',
              '_blank'
            );
          }}
        >
          <NewIcon className={iconStyle} />
          {t["Discover what's new!"]()}
        </div>
        <IconButton
          className={iconButtonStyle}
          onClick={() => {
            handleClose();
          }}
          data-testid="change-log-close-button"
        >
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default ChangeLog;
