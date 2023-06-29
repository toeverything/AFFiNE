import { Trans } from '@affine/i18n';
import { AffineLogoSBlue2_1Icon, CloseIcon } from '@blocksuite/icons';

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
        <AffineLogoSBlue2_1Icon className={downloadTipIconStyle} />
        <div className={downloadMessageStyle}>
          <Trans i18nKey="com.affine.banner.content">
            Enjoying the demo?
            <a
              className={linkStyle}
              href="https://affine.pro/download"
              target="_blank"
              rel="noreferrer"
            >
              Download the AFFiNE Client
            </a>
            for the full experience.
          </Trans>
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
