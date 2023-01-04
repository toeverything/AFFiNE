import { NotFoundTitle, PageContainer } from './styles';
import { useTranslation } from 'react-i18next';
export const NotfoundPage = () => {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <NotFoundTitle>{t('404 - Page Not Found')}</NotFoundTitle>
    </PageContainer>
  );
};

export default NotfoundPage;
