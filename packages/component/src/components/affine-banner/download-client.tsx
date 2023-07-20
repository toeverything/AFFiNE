import { Trans } from '@affine/i18n';
import { CloseIcon, Logo1Icon } from '@blocksuite/icons';

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
        <Logo1Icon className={downloadTipIconStyle} />
        <div className={downloadMessageStyle}>
          <Trans i18nKey="com.affine.banner.content">
            This demo is limited.
            <a
              className={linkStyle}
              href="https://affine.pro/download"
              target="_blank"
              rel="noreferrer"
            >
              Download the AFFiNE Client
            </a>
            for the latest features and Performance.
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
