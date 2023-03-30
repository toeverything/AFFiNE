import { useTranslation } from '@affine/i18n';

import { StyledPivot } from '../styles';

export const EmptyItem = () => {
  const { t } = useTranslation();
  return <StyledPivot disable={true}>{t('No item')}</StyledPivot>;
};

export default EmptyItem;
