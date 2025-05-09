import type { PropsWithChildren } from 'react';

import { authContainer } from './share.css';

export function AuthContainer(props: PropsWithChildren) {
  return <div className={authContainer}>{props.children}</div>;
}
