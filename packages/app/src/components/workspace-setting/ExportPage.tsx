import { useTranslation } from '@affine/i18n';
import { Wrapper } from '@/ui/layout';
import { Button } from '@/ui/button';

export const ExportPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Wrapper marginBottom="32px"> {t('Export Description')}</Wrapper>
      <Button type="light" shape="circle" disabled>
        {t('Export AFFINE backup file (coming soon)')}
      </Button>
    </>
  );
};
