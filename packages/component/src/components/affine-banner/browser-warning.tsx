import { CloseIcon } from '@blocksuite/icons';
import type React from 'react';

import {
  browserWarningStyle,
  closeButtonStyle,
  closeIconStyle,
} from './index.css';

export const BrowserWarning = ({
  show,
  onClose,
  message,
}: {
  show: boolean;
  onClose: () => void;
  message: React.ReactNode;
}) => {
  if (!show) {
    return null;
  }
  return (
    <div className={browserWarningStyle}>
      {message}
      <div className={closeButtonStyle} onClick={onClose}>
        <CloseIcon className={closeIconStyle} />
      </div>
    </div>
  );
};

export default BrowserWarning;
