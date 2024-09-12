import type { FC, PropsWithChildren, ReactNode } from 'react';

import { Empty } from '../../ui/empty';
import { AffineOtherPageLayout } from '../affine-other-page-layout';
import { authPageContainer, hideInSmallScreen } from './share.css';

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
            <p className="subtitle">{subtitle}</p>
            {children}
          </div>
          <div className={hideInSmallScreen}>
            <Empty />
          </div>
        </div>
      </div>
    </AffineOtherPageLayout>
  );
};
