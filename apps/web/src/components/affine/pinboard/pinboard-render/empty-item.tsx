import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { StyledPinboard } from '../styles';

export const EmptyItem = () => {
  const t = useAFFiNEI18N();
  return (
    <StyledPinboard disable={true} textWrap={true}>
      {t['Organize pages to build knowledge']()}
    </StyledPinboard>
  );
};

export default EmptyItem;
