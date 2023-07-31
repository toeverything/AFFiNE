import type { FC, PropsWithChildren, ReactNode } from 'react';

import { Empty } from '../../ui/empty';
import { Wrapper } from '../../ui/layout';
import { Logo } from './logo';
import { authPageContainer } from './share.css';

export const AuthPageContainer: FC<
  PropsWithChildren<{ title?: ReactNode; subtitle?: ReactNode }>
> = ({ children, title, subtitle }) => {
  return (
    <div className={authPageContainer}>
      <Wrapper
        style={{
          position: 'absolute',
          top: 25,
          left: 20,
        }}
      >
        <Logo />
      </Wrapper>
      <div className="wrapper">
        <div className="content">
          <p className="title">{title}</p>
          <p className="subtitle">{subtitle}</p>
          {children}
        </div>
        <Empty />
      </div>
    </div>
  );
};
