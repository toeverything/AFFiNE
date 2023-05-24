import { AffineLogoSimSBlue1_1Icon, CloseIcon } from '@blocksuite/icons';

import {
  downloadCloseButtonStyle,
  downloadMessageStyle,
  downloadTipContainerStyle,
  downloadTipIconStyle,
  downloadTipStyle,
  linkStyle,
} from './index.css';

export const DownloadTips = ({ onClose }: { onClose: () => void }) => {
  return (
    <div
      className={downloadTipContainerStyle}
      data-testid="download-client-tip"
    >
      <div className={downloadTipStyle}>
        <AffineLogoSimSBlue1_1Icon className={downloadTipIconStyle} />
        <div className={downloadMessageStyle}>
          Enjoying the demo? &nbsp;
          <a
            className={linkStyle}
            href="https://github.com/toeverything/AFFiNE/releases"
            target="_blank"
            rel="noreferrer"
          >
            Download the AFFiNE Client
          </a>
          &nbsp;for the full experience.
        </div>
      </div>
      <div
        className={downloadCloseButtonStyle}
        onClick={onClose}
        data-testid="download-client-tip-close-button"
      >
        <CloseIcon className={downloadTipIconStyle} />
      </div>
    </div>
  );
};

export default DownloadTips;
