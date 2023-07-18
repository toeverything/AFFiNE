import { MenuItem } from '@affine/component/app-sidebar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

export const EmptyItem = () => {
  const t = useAFFiNEI18N();
  return (
    <MenuItem disabled={true}>{t['Favorite pages for easy access']()}</MenuItem>
  );
};

export default EmptyItem;
