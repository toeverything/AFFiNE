import { useTranslation } from '@affine/i18n';

import { StyledCollapseItem } from '../shared-styles';

export const EmptyItem = () => {
  const { t } = useTranslation();
  return <StyledCollapseItem disable={true}>{t('No item')}</StyledCollapseItem>;
};

export default EmptyItem;
