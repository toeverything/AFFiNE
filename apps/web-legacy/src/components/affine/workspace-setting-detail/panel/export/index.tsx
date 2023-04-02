import { Button, Wrapper } from '@affine/component';
import { useTranslation } from '@affine/i18n';

export const ExportPanel = () => {
  const { t } = useTranslation();
  return (
    <>
      <Wrapper marginBottom="42px"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFiNE backup file')}
      </Button>
    </>
  );
};
