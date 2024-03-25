import type { FC, PropsWithChildren, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { Empty } from '../../ui/empty';
import { AffineOtherPageLayout } from '../affine-other-page-layout';
import { authPageContainer } from './share.css';

export const AuthPageContainer: FC<
  PropsWithChildren<{ title?: ReactNode; subtitle?: ReactNode }>
> = ({ children, title, subtitle }) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth <= 1024);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return (
    <AffineOtherPageLayout isSmallScreen={isSmallScreen}>
      <div className={authPageContainer}>
        <div className="wrapper">
          <div className="content">
            <p className="title">{title}</p>
            <p className="subtitle">{subtitle}</p>
            {children}
          </div>
          {isSmallScreen ? null : <Empty />}
        </div>
      </div>
    </AffineOtherPageLayout>
  );
};
