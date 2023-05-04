import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { StyledCollapseItem } from '../shared-styles';

export const EmptyItem = () => {
  const t = useAFFiNEI18N();
  return (
    <StyledCollapseItem disable={true} textWrap={true}>
      {t['Favorite pages for easy access']()}
    </StyledCollapseItem>
  );
};

export default EmptyItem;
