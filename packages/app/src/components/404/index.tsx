import { NotFoundTitle, PageContainer } from './styles';
import { useTranslation } from '@affine/i18n';
export const NotfoundPage = () => {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <NotFoundTitle>{t('404 - Page Not Found')}</NotFoundTitle>
    </PageContainer>
  );
};

export default NotfoundPage;
