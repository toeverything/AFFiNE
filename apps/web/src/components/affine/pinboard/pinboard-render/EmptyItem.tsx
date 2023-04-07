import { useTranslation } from '@affine/i18n';

import { StyledPinboard } from '../styles';

export const EmptyItem = () => {
  const { t } = useTranslation();
  return (
    <StyledPinboard disable={true} style={{ paddingLeft: '32px' }}>
      {t('No item')}
    </StyledPinboard>
  );
};

export default EmptyItem;
