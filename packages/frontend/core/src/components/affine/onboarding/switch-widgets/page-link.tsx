import { LinkedPageIcon } from '@blocksuite/icons/rc';
import type { PropsWithChildren } from 'react';

import { pageLink, pageLinkIcon, pageLinkLabel } from '../articles/blocks.css';

interface PageLinkProps extends PropsWithChildren {}

export const PageLink = ({ children }: PageLinkProps) => {
  return (
    <a className={pageLink}>
      <LinkedPageIcon className={pageLinkIcon} />
      <span className={pageLinkLabel}>{children}</span>
    </a>
  );
};
