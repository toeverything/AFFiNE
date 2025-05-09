import type { PropsWithChildren } from 'react';

import { authFooter } from './share.css';

export function AuthFooter(props: PropsWithChildren) {
  return <div className={authFooter}>{props.children}</div>;
}
