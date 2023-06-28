import { useAFFiNEI18N } from '@affine/i18n/hooks';
import clsx from 'clsx';

import { linkStyle, linkTextStyle, waterMarkStyle } from './index.css';
import { AffineLogoIcon } from './logo';

export const AffineWatermark = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={clsx()}>
      <div data-testid="affine-watermark" className={clsx(waterMarkStyle)}>
        <a className={linkStyle} href="https://affine.pro">
          <div className={linkTextStyle}>{t['Created with']()}</div>
          <AffineLogoIcon />
        </a>
      </div>
    </div>
  );
};
