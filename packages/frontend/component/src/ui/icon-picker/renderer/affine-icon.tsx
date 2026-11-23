import * as allIcons from '@blocksuite/icons/rc';
import type { SVGProps } from 'react';

export const AffineIconRenderer = ({
  name,
  ...props
}: {
  name: string;
} & SVGProps<SVGSVGElement>) => {
  const Icon = allIcons[
    `${name}Icon` as keyof typeof allIcons
  ] as React.ComponentType<React.SVGProps<SVGSVGElement>>;

  if (!Icon) {
    return null;
  }

  return <Icon {...props} />;
};
