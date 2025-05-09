import type { FC, PropsWithChildren, ReactNode } from 'react';

import { ThemedImg } from '../../ui/themed-img';
import { AffineOtherPageLayout } from '../affine-other-page-layout';
import illustrationDark from '../affine-other-page-layout/assets/other-page.dark.png';
import illustrationLight from '../affine-other-page-layout/assets/other-page.light.png';
import {
  authPageContainer,
  hideInSmallScreen,
  illustration,
} from './share.css';

export const AuthPageContainer: FC<
  PropsWithChildren<{
    title?: ReactNode;
    subtitle?: ReactNode;
  }>
> = ({ children, title, subtitle }) => {
  return (
    <AffineOtherPageLayout>
      <div className={authPageContainer}>
        <div className="wrapper">
          <div className="content">
            <p className="title">{title}</p>
            <div className="subtitle">{subtitle}</div>
            {children}
          </div>
          <div className={hideInSmallScreen}>
            <ThemedImg
              draggable={false}
              className={illustration}
              lightSrc={illustrationLight}
              darkSrc={illustrationDark}
            />
          </div>
        </div>
      </div>
    </AffineOtherPageLayout>
  );
};
