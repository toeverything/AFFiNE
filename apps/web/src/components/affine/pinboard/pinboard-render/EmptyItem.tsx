import { useTranslation } from '@affine/i18n';

import { StyledPinboard } from '../styles';

export const EmptyItem = () => {
  const { t } = useTranslation();
  return (
    <StyledPinboard disable={true} textWrap={true}>
      {t('Organize pages to build knowledge')}
    </StyledPinboard>
  );
};

export default EmptyItem;
