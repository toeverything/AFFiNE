import { type IconData, IconRenderer } from '@affine/component';

export const getDocIconComponent = (icon: IconData) => {
  const Icon = () => <IconRenderer data={icon} />;
  Icon.displayName = 'DocIcon';
  return Icon;
};
