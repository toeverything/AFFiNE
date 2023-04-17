import { useTranslation } from '@affine/i18n';

import { StyledCollapseItem } from '../shared-styles';

export const EmptyItem = () => {
  const { t } = useTranslation();
  return (
    <StyledCollapseItem disable={true} textWrap={true}>
      {t('Favorite pages for easy access')}
    </StyledCollapseItem>
  );
};

export default EmptyItem;
