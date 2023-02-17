import { Button } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useRouter } from 'next/router';

import { NotFoundTitle, PageContainer } from './styles';
export const NotfoundPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <PageContainer>
      <NotFoundTitle data-testid="notFound">
        {t('404 - Page Not Found')}
        <p>
          <Button
            onClick={() => {
              router.push('/workspace');
            }}
          >
            {t('Back Home')}
          </Button>
        </p>
      </NotFoundTitle>
    </PageContainer>
  );
};

export default NotfoundPage;
