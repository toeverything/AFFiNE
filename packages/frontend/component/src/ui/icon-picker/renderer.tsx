import { AffineIconRenderer } from './renderer/affine-icon';

export const IconRenderer = ({
  iconType,
  icon,
}: {
  iconType: 'emoji' | 'affine-icon';
  icon: string;
}) => {
  if (iconType === 'emoji') {
    return icon;
  }
  if (iconType === 'affine-icon') {
    return <AffineIconRenderer name={icon} />;
  }

  return null;
};
