import { NotFoundTitle, PageContainer } from './styles';
import { useTranslation } from '@affine/i18n';
import { Button } from '@/ui/button';
import { useRouter } from 'next/router';
export const NotfoundPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <PageContainer>
      <NotFoundTitle>
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
