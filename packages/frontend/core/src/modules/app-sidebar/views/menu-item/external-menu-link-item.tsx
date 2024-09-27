import { DualLinkIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { ReactElement } from 'react';
import type { To } from 'react-router-dom';

import { MenuLinkItem } from './index';

const RawLink = ({
  children,
  to,
  className,
}: {
  children?: React.ReactNode;
  to: To;
  className?: string;
}) => {
  const href = typeof to === 'string' ? to : to.pathname;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
};

export const ExternalMenuLinkItem = ({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactElement;
  label: string;
}) => {
  return (
    <MenuLinkItem to={href} linkComponent={RawLink} icon={icon}>
      {label}
      <DualLinkIcon
        width={12}
        height={12}
        style={{ marginLeft: 4, color: cssVarV2('icon/tertiary') }}
      />
    </MenuLinkItem>
  );
};
