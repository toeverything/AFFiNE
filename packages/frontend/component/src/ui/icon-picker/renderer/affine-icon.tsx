import * as allIcons from '@blocksuite/icons/rc';

export const AffineIconRenderer = ({
  name,
  ...props
}: {
  name: string;
} & React.SVGProps<SVGSVGElement>) => {
  const Icon = allIcons[
    `${name}Icon` as keyof typeof allIcons
  ] as React.ComponentType<React.SVGProps<SVGSVGElement>>;

  if (!Icon) {
    return null;
  }

  return <Icon {...props} />;
};
